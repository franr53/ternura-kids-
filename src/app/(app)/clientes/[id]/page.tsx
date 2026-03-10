'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, FiadoMovimiento, Venta } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Save, MessageCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [movimientos, setMovimientos] = useState<FiadoMovimiento[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [montoAbono, setMontoAbono] = useState('')
  const [notasAbono, setNotasAbono] = useState('')

  useEffect(() => {
    async function cargar() {
      const [{ data: c }, { data: movs }, { data: vs }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('fiado_movimientos').select('*').eq('cliente_id', id).order('creado_en', { ascending: false }).limit(30),
        supabase.from('ventas').select('*, venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre)))').eq('cliente_id', id).eq('estado', 'completada').order('creado_en', { ascending: false }).limit(10),
      ])
      if (c) { setCliente(c); setNombre(c.nombre); setTelefono(c.telefono || ''); setDireccion(c.direccion || '') }
      setMovimientos(movs || [])
      setVentas(vs || [])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.from('clientes').update({ nombre, telefono: telefono || null, direccion: direccion || null }).eq('id', id)
    if (error) toast.error('Error al guardar')
    else { toast.success('Cliente actualizado'); setCliente(prev => prev ? { ...prev, nombre, telefono, direccion } : null) }
    setGuardando(false)
  }

  async function registrarAbono() {
    const monto = parseFloat(montoAbono)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!cliente) return

    const { error } = await supabase.from('fiado_movimientos').insert({
      cliente_id: id,
      tipo: 'abono',
      monto,
      notas: notasAbono || null,
    })
    if (error) { toast.error('Error al registrar abono'); return }

    const nuevaDeuda = Math.max(0, (cliente.deuda_total || 0) - monto)
    await supabase.from('clientes').update({ deuda_total: nuevaDeuda }).eq('id', id)
    setCliente(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    setMovimientos(prev => [{ id: Date.now().toString(), cliente_id: id, tipo: 'abono', monto, notas: notasAbono || undefined, creado_en: new Date().toISOString() }, ...prev])
    setMontoAbono('')
    setNotasAbono('')
    toast.success(`Abono de ${formatPrecio(monto)} registrado`)
  }

  function abrirWhatsApp() {
    if (!telefono) return
    const tel = telefono.replace(/\D/g, '')
    const deuda = cliente?.deuda_total || 0
    const msg = `Hola ${nombre}! Te recordamos que tenés una deuda pendiente de *${formatPrecio(deuda)}* en Ternura Kids. Podés pasar a abonar cuando quieras. 💕`
    window.open(`https://wa.me/54${tel}?text=${encodeURIComponent(msg)}`, '_blank')
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!cliente) return <div className="p-8 text-center text-gray-500">Cliente no encontrado</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/clientes"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{cliente.nombre}</h1>
            {cliente.deuda_total > 0 && <Badge variant="destructive" className="mt-1">Debe {formatPrecio(cliente.deuda_total)}</Badge>}
          </div>
        </div>
        <div className="flex gap-2">
          {telefono && (
            <Button variant="outline" onClick={abrirWhatsApp} className="gap-2 text-green-600 border-green-300">
              <MessageCircle size={16} /> WhatsApp
            </Button>
          )}
          <Button onClick={guardar} disabled={guardando} className="bg-pink-500 hover:bg-pink-600 gap-2">
            <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Datos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nombre</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" /></div>
            <div><Label>Teléfono</Label><Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="3516123456" className="mt-1" /></div>
            <div><Label>Dirección</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} className="mt-1" /></div>
          </CardContent>
        </Card>

        {/* Fiado */}
        <Card>
          <CardHeader><CardTitle className="text-base">Fiado</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-center py-2">
              <p className="text-3xl font-bold text-red-500">{formatPrecio(cliente.deuda_total)}</p>
              <p className="text-xs text-gray-500">deuda actual</p>
            </div>
            <div><Label>Registrar abono</Label>
              <div className="flex gap-2 mt-1">
                <Input type="number" value={montoAbono} onChange={e => setMontoAbono(e.target.value)} placeholder="Monto" />
                <Button onClick={registrarAbono} className="bg-green-500 hover:bg-green-600 gap-1"><Plus size={16} /></Button>
              </div>
              <Input value={notasAbono} onChange={e => setNotasAbono(e.target.value)} placeholder="Nota (opcional)" className="mt-2 text-sm" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Historial fiado */}
      {movimientos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de fiado</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {movimientos.map(mov => (
                <div key={mov.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <Badge variant={mov.tipo === 'cargo' ? 'destructive' : 'secondary'}>
                      {mov.tipo === 'cargo' ? 'Cargo' : 'Abono'}
                    </Badge>
                    {mov.notas && <span className="text-xs text-gray-500 ml-2">{mov.notas}</span>}
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${mov.tipo === 'cargo' ? 'text-red-500' : 'text-green-600'}`}>
                      {mov.tipo === 'cargo' ? '+' : '-'} {formatPrecio(mov.monto)}
                    </p>
                    <p className="text-xs text-gray-400">{new Date(mov.creado_en).toLocaleDateString('es-AR')}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Historial compras */}
      {ventas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Últimas compras</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ventas.map(venta => (
                <div key={venta.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-700">{new Date(venta.creado_en).toLocaleDateString('es-AR')}</p>
                    <p className="text-xs text-gray-500">{(venta as any).venta_items?.length || 0} artículos</p>
                  </div>
                  <p className="font-semibold text-gray-800">{formatPrecio(venta.total)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
