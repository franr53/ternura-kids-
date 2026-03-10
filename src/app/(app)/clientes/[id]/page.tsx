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
import { ArrowLeft, Save, MessageCircle, CheckCircle, Banknote, Smartphone, CreditCard, ChevronDown, ChevronRight, ShoppingBag } from 'lucide-react'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

type VentaItem = {
  cantidad: number
  precio_unitario: number
  variante?: { talle: string; producto?: { nombre: string } }
}

type VentaConItems = Venta & {
  venta_items?: VentaItem[]
  venta_pagos?: { metodo: string; monto: number }[]
}

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [movimientos, setMovimientos] = useState<FiadoMovimiento[]>([])
  const [ventas, setVentas] = useState<VentaConItems[]>([])
  const [ventaExpandida, setVentaExpandida] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [montoAbono, setMontoAbono] = useState('')
  const [notasAbono, setNotasAbono] = useState('')
  const [metodoPagoAbono, setMetodoPagoAbono] = useState<'efectivo' | 'transferencia' | 'debito'>('efectivo')

  useEffect(() => {
    async function cargar() {
      const [{ data: c }, { data: movs }, { data: vs }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('fiado_movimientos').select('*').eq('cliente_id', id).order('creado_en', { ascending: false }).limit(30),
        supabase.from('ventas').select('*, venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre))), venta_pagos(metodo, monto)').eq('cliente_id', id).eq('estado', 'completada').order('creado_en', { ascending: false }).limit(20),
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
          <Button onClick={guardar} disabled={guardando} className="bg-teal-500 hover:bg-teal-600 gap-2">
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
        <Card className={cliente.deuda_total > 0 ? 'border-red-200' : ''}>
          <CardHeader><CardTitle className="text-base">Cuenta corriente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2 rounded-xl bg-gray-50">
              <p className={`text-3xl font-bold ${cliente.deuda_total > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {formatPrecio(cliente.deuda_total)}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">deuda actual</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Registrar pago</Label>
              <Input
                type="number"
                value={montoAbono}
                onChange={e => setMontoAbono(e.target.value)}
                placeholder="Monto a cobrar"
                className="text-base"
              />
              {montoAbono && parseFloat(montoAbono) > 0 && (
                <p className="text-xs text-gray-500">
                  Saldo resultante:{' '}
                  <span className={`font-semibold ${Math.max(0, cliente.deuda_total - parseFloat(montoAbono)) === 0 ? 'text-green-600' : 'text-red-500'}`}>
                    {formatPrecio(Math.max(0, cliente.deuda_total - parseFloat(montoAbono)))}
                  </span>
                </p>
              )}

              {/* Método de pago */}
              <div className="flex gap-1.5">
                {([
                  { key: 'efectivo', label: 'Efectivo', icon: <Banknote size={13} /> },
                  { key: 'transferencia', label: 'Transfer.', icon: <Smartphone size={13} /> },
                  { key: 'debito', label: 'Débito', icon: <CreditCard size={13} /> },
                ] as const).map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPagoAbono(m.key)}
                    className={cn(
                      'flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg border text-xs font-medium transition-colors',
                      metodoPagoAbono === m.key
                        ? 'bg-green-100 border-green-400 text-green-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>

              <Input
                value={notasAbono}
                onChange={e => setNotasAbono(e.target.value)}
                placeholder="Nota (opcional)"
                className="text-sm"
              />
              <Button
                onClick={registrarAbono}
                className="w-full bg-green-500 hover:bg-green-600 gap-2 h-10"
              >
                <CheckCircle size={16} /> Confirmar pago
              </Button>
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
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShoppingBag size={16} className="text-teal-500" /> Historial de compras</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div>
              {ventas.map((venta, i) => {
                const items = venta.venta_items || []
                const expandida = ventaExpandida === venta.id
                const metodos = venta.venta_pagos?.map(p => p.metodo).join(' + ') || ''
                return (
                  <div key={venta.id} className={cn('border-b border-gray-50 last:border-0', expandida && 'bg-teal-50/40')}>
                    {/* Fila principal — clickeable para expandir */}
                    <button
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors text-left"
                      onClick={() => setVentaExpandida(expandida ? null : venta.id)}
                    >
                      <div className="text-gray-400 shrink-0">
                        {expandida ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">
                          {new Date(venta.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400">
                          {items.length} {items.length === 1 ? 'artículo' : 'artículos'}
                          {metodos && <span className="ml-2 text-gray-300">· {metodos}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-800">{formatPrecio(venta.total)}</p>
                        {venta.descuento > 0 && (
                          <p className="text-xs text-green-600">− {formatPrecio(venta.descuento)} desc.</p>
                        )}
                      </div>
                    </button>

                    {/* Detalle de artículos */}
                    {expandida && items.length > 0 && (
                      <div className="px-5 pb-3 space-y-1">
                        <div className="bg-white rounded-xl border border-teal-100 overflow-hidden">
                          {items.map((item, j) => (
                            <div key={j} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-50 last:border-0">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">
                                  {item.variante?.producto?.nombre || '—'}
                                </p>
                                {item.variante?.talle && (
                                  <p className="text-xs text-gray-400">Talle {item.variante.talle}</p>
                                )}
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                {item.cantidad > 1 && (
                                  <p className="text-xs text-gray-400">{item.cantidad} × {formatPrecio(item.precio_unitario)}</p>
                                )}
                                <p className="text-sm font-semibold text-gray-700">
                                  {formatPrecio(item.precio_unitario * item.cantidad)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
