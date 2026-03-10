'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Caja } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Wallet, Plus, Lock } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

interface Retiro {
  id: string
  caja_id: string
  monto: number
  motivo: string
  creado_en: string
}

export default function CajaPage() {
  const supabase = createClient()
  const [caja, setCaja] = useState<Caja | null>(null)
  const [retiros, setRetiros] = useState<Retiro[]>([])
  const [loading, setLoading] = useState(true)
  const [montoInicial, setMontoInicial] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [montoRetiro, setMontoRetiro] = useState('')
  const [motivoRetiro, setMotivoRetiro] = useState('')

  const cargarCaja = useCallback(async () => {
    setLoading(true)
    const hoy = new Date().toISOString().split('T')[0]
    const { data: cajaData } = await supabase
      .from('cajas')
      .select('*')
      .eq('fecha', hoy)
      .order('abierta_en', { ascending: false })
      .limit(1)
      .maybeSingle()

    setCaja(cajaData || null)

    if (cajaData) {
      const { data: retirosData } = await supabase
        .from('retiros_caja')
        .select('*')
        .eq('caja_id', cajaData.id)
        .order('creado_en', { ascending: false })
      setRetiros(retirosData || [])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { cargarCaja() }, [cargarCaja])

  async function abrirCaja() {
    const monto = parseFloat(montoInicial) || 0
    setAbriendo(true)
    const hoy = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase.from('cajas').insert({
      fecha: hoy,
      monto_inicial: monto,
      total_efectivo: 0,
      total_transferencia: 0,
      total_debito: 0,
      total_credito: 0,
      total_fiado: 0,
      total_retiros: 0,
      estado: 'abierta',
    }).select().single()
    if (error) { toast.error('Error al abrir caja'); setAbriendo(false); return }
    toast.success('Caja abierta')
    setCaja(data)
    setAbriendo(false)
  }

  async function cerrarCaja() {
    if (!caja) return
    setCerrando(true)
    const { error } = await supabase.from('cajas').update({
      estado: 'cerrada',
      cerrada_en: new Date().toISOString(),
    }).eq('id', caja.id)
    if (error) { toast.error('Error al cerrar caja'); setCerrando(false); return }
    toast.success('Caja cerrada')
    setCaja(prev => prev ? { ...prev, estado: 'cerrada', cerrada_en: new Date().toISOString() } : null)
    setCerrando(false)
  }

  async function agregarRetiro() {
    const monto = parseFloat(montoRetiro)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!motivoRetiro.trim()) { toast.error('Ingresá un motivo'); return }
    if (!caja) return

    const { error } = await supabase.from('retiros_caja').insert({
      caja_id: caja.id,
      monto,
      motivo: motivoRetiro,
    })
    if (error) { toast.error('Error al registrar retiro'); return }

    await supabase.from('cajas').update({ total_retiros: (caja.total_retiros || 0) + monto }).eq('id', caja.id)
    setCaja(prev => prev ? { ...prev, total_retiros: (prev.total_retiros || 0) + monto } : null)
    setRetiros(prev => [{ id: Date.now().toString(), caja_id: caja.id, monto, motivo: motivoRetiro, creado_en: new Date().toISOString() }, ...prev])
    setMontoRetiro('')
    setMotivoRetiro('')
    toast.success('Retiro registrado')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  // No hay caja hoy
  if (!caja) {
    return (
      <div className="p-6 max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg"><Wallet size={24} className="text-teal-600" /></div>
          <h1 className="text-2xl font-bold text-gray-800">Abrir caja</h1>
        </div>
        <Card>
          <CardHeader><CardTitle className="text-base">Monto inicial en efectivo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Monto inicial</Label>
              <Input
                type="number"
                value={montoInicial}
                onChange={e => setMontoInicial(e.target.value)}
                placeholder="0"
                className="mt-1 text-lg"
                autoFocus
              />
            </div>
            <Button onClick={abrirCaja} disabled={abriendo} className="w-full bg-teal-500 hover:bg-teal-600">
              {abriendo ? 'Abriendo...' : 'Abrir caja del día'}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const totalVentas = (caja.total_efectivo || 0) + (caja.total_transferencia || 0) + (caja.total_debito || 0) + (caja.total_credito || 0) + (caja.total_fiado || 0)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg"><Wallet size={24} className="text-teal-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Caja del día</h1>
            <p className="text-gray-500 text-sm">{new Date(caja.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
        </div>
        <Badge variant={caja.estado === 'abierta' ? 'secondary' : 'outline'} className={caja.estado === 'abierta' ? 'bg-green-100 text-green-700' : ''}>
          {caja.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
        </Badge>
      </div>

      {/* Totales por método */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Total ventas</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{formatPrecio(totalVentas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Fondo inicial</p>
            <p className="text-3xl font-bold text-gray-800 mt-1">{formatPrecio(caja.monto_inicial)}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Desglose por método de pago</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {[
            { label: 'Efectivo', value: caja.total_efectivo, color: 'text-green-600' },
            { label: 'Transferencia', value: caja.total_transferencia, color: 'text-blue-600' },
            { label: 'Débito', value: caja.total_debito, color: 'text-purple-600' },
            { label: 'Crédito', value: caja.total_credito, color: 'text-orange-600' },
            { label: 'Fiado', value: caja.total_fiado, color: 'text-red-500' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-gray-600">{label}</span>
              <span className={`font-semibold ${color}`}>{formatPrecio(value || 0)}</span>
            </div>
          ))}
          <Separator />
          <div className="flex justify-between items-center font-bold">
            <span>Total</span>
            <span className="text-gray-800">{formatPrecio(totalVentas)}</span>
          </div>
          {(caja.total_retiros || 0) > 0 && (
            <div className="flex justify-between items-center text-red-500">
              <span>Retiros</span>
              <span>- {formatPrecio(caja.total_retiros)}</span>
            </div>
          )}
          <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
            <span>Efectivo en caja</span>
            <span className="text-green-600">{formatPrecio((caja.monto_inicial || 0) + (caja.total_efectivo || 0) - (caja.total_retiros || 0))}</span>
          </div>
        </CardContent>
      </Card>

      {/* Retiros */}
      {caja.estado === 'abierta' && (
        <Card>
          <CardHeader><CardTitle className="text-base">Retiros de efectivo</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" value={montoRetiro} onChange={e => setMontoRetiro(e.target.value)} placeholder="Monto" />
              <Input value={motivoRetiro} onChange={e => setMotivoRetiro(e.target.value)} placeholder="Motivo" className="col-span-2" />
            </div>
            <Button onClick={agregarRetiro} variant="outline" className="gap-2">
              <Plus size={16} /> Agregar retiro
            </Button>
            {retiros.length > 0 && (
              <div className="space-y-2 mt-2">
                {retiros.map(r => (
                  <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                    <span className="text-gray-600">{r.motivo}</span>
                    <div className="text-right">
                      <span className="font-medium text-red-500">{formatPrecio(r.monto)}</span>
                      <p className="text-xs text-gray-400">{new Date(r.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Botón cerrar caja */}
      {caja.estado === 'abierta' && (
        <Button onClick={cerrarCaja} disabled={cerrando} variant="outline" className="w-full border-red-200 text-red-600 hover:bg-red-50 gap-2">
          <Lock size={16} /> {cerrando ? 'Cerrando...' : 'Cerrar caja del día'}
        </Button>
      )}

      {caja.estado === 'cerrada' && (
        <Card className="border-gray-200 bg-gray-50">
          <CardContent className="pt-4 pb-4 text-center">
            <Lock size={24} className="mx-auto text-gray-400 mb-2" />
            <p className="text-gray-500 text-sm">Caja cerrada{caja.cerrada_en ? ` a las ${new Date(caja.cerrada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
