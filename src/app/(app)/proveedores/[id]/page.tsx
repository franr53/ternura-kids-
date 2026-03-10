'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Proveedor, IngresoMercaderia } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { ArrowLeft, Save, Plus, FileText } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

interface PagoProveedor {
  id: string
  proveedor_id: string
  monto: number
  metodo: string
  notas?: string
  creado_en: string
}

export default function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [ingresos, setIngresos] = useState<IngresoMercaderia[]>([])
  const [pagos, setPagos] = useState<PagoProveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')

  const [montoPago, setMontoPago] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')

  useEffect(() => {
    async function cargar() {
      const [{ data: p }, { data: ing }, { data: pag }] = await Promise.all([
        supabase.from('proveedores').select('*').eq('id', id).single(),
        supabase.from('ingresos_mercaderia').select('*').eq('proveedor_id', id).order('creado_en', { ascending: false }).limit(20),
        supabase.from('pagos_proveedores').select('*').eq('proveedor_id', id).order('creado_en', { ascending: false }).limit(20),
      ])
      if (p) {
        setProveedor(p)
        setNombre(p.nombre)
        setTelefono(p.telefono || '')
        setEmail(p.email || '')
        setDireccion(p.direccion || '')
        setNotas(p.notas || '')
      }
      setIngresos(ing || [])
      setPagos(pag || [])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.from('proveedores').update({
      nombre, telefono: telefono || null, email: email || null,
      direccion: direccion || null, notas: notas || null,
    }).eq('id', id)
    if (error) toast.error('Error al guardar')
    else { toast.success('Proveedor actualizado'); setProveedor(prev => prev ? { ...prev, nombre, telefono, email, direccion, notas } : null) }
    setGuardando(false)
  }

  async function registrarPago() {
    const monto = parseFloat(montoPago)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!proveedor) return

    const { error } = await supabase.from('pagos_proveedores').insert({
      proveedor_id: id,
      monto,
      metodo: metodoPago,
    })
    if (error) { toast.error('Error al registrar pago'); return }

    const nuevaDeuda = Math.max(0, (proveedor.deuda_total || 0) - monto)
    await supabase.from('proveedores').update({ deuda_total: nuevaDeuda }).eq('id', id)
    setProveedor(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    setPagos(prev => [{ id: Date.now().toString(), proveedor_id: id, monto, metodo: metodoPago, creado_en: new Date().toISOString() }, ...prev])
    setMontoPago('')
    toast.success(`Pago de ${formatPrecio(monto)} registrado`)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!proveedor) return <div className="p-8 text-center text-gray-500">Proveedor no encontrado</div>

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/proveedores"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
          <div>
            <h1 className="text-xl font-bold text-gray-800">{proveedor.nombre}</h1>
            {proveedor.deuda_total > 0 && (
              <Badge variant="destructive" className="mt-1">Deuda: {formatPrecio(proveedor.deuda_total)}</Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href={`/proveedores/ingreso?proveedor=${id}`}>
            <Button variant="outline" className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50">
              <FileText size={16} /> Cargar boleta
            </Button>
          </Link>
          <Button onClick={guardar} disabled={guardando} className="bg-teal-500 hover:bg-teal-600 gap-2">
            <Save size={16} /> {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </div>

      {/* Deuda prominente */}
      {proveedor.deuda_total > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-4">
            <div className="text-center">
              <p className="text-4xl font-bold text-red-600">{formatPrecio(proveedor.deuda_total)}</p>
              <p className="text-sm text-red-500 mt-1">Deuda pendiente con este proveedor</p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-6">
        {/* Datos */}
        <Card>
          <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><Label>Nombre</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" /></div>
            <div><Label>Teléfono</Label><Input value={telefono} onChange={e => setTelefono(e.target.value)} className="mt-1" /></div>
            <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
            <div><Label>Dirección</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} className="mt-1" /></div>
            <div><Label>Notas</Label><Textarea value={notas} onChange={e => setNotas(e.target.value)} className="mt-1" rows={2} /></div>
          </CardContent>
        </Card>

        {/* Registrar pago */}
        <Card>
          <CardHeader><CardTitle className="text-base">Registrar pago</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Monto</Label>
              <Input type="number" value={montoPago} onChange={e => setMontoPago(e.target.value)} placeholder="0" className="mt-1" />
            </div>
            <div>
              <Label>Método</Label>
              <Select value={metodoPago} onValueChange={v => setMetodoPago(v ?? 'efectivo')}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={registrarPago} className="w-full bg-green-500 hover:bg-green-600 gap-2">
              <Plus size={16} /> Registrar pago
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Ingresos recientes */}
      {ingresos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Ingresos recientes</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">Fecha</th>
                  <th className="text-left py-2 text-gray-500 font-medium">N° Remito</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {ingresos.map(ing => (
                  <tr key={ing.id} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 text-gray-700">{new Date(ing.creado_en).toLocaleDateString('es-AR')}</td>
                    <td className="py-2 text-gray-600">{ing.numero_remito || '—'}</td>
                    <td className="py-2 text-right font-medium text-gray-800">{formatPrecio(ing.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Historial pagos */}
      {pagos.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Historial de pagos</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pagos.map(pago => (
                <div key={pago.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <Badge variant="secondary" className="capitalize">{pago.metodo}</Badge>
                    <span className="text-xs text-gray-400 ml-2">{new Date(pago.creado_en).toLocaleDateString('es-AR')}</span>
                  </div>
                  <p className="font-semibold text-green-600">{formatPrecio(pago.monto)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
