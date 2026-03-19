'use client'

import { useEffect, useState, use } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, FiadoMovimiento, Proveedor, Venta } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Save, MessageCircle, CheckCircle, Banknote, Smartphone, CreditCard, ChevronDown, ChevronRight, ShoppingBag, Loader2, X } from 'lucide-react'
import { cn, formatPrecio, formatNombreConTalle } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'
import Link from 'next/link'
import { FieldError } from '@/components/ui/field-error'
import { validarRequerido, validarMaxLength, validarTelefono } from '@/lib/validations'
import { generarPDFRecibo, compartirPDFWhatsApp, type ReciboAbonoData } from '@/lib/etiquetas-pdf'

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
  const { mask } = usePrivacyMode()
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
  const [errors, setErrors] = useState<Record<string, string | null>>({})
  const [ultimoAbono, setUltimoAbono] = useState<{ monto: number; deudaRestante: number } | null>(null)
  const [enviandoRecibo, setEnviandoRecibo] = useState(false)
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorTransferencia, setProveedorTransferencia] = useState<Proveedor | null>(null)

  useEffect(() => {
    async function cargar() {
      const [{ data: c }, { data: movs }, { data: vs }, { data: provs }] = await Promise.all([
        supabase.from('clientes').select('*').eq('id', id).single(),
        supabase.from('fiado_movimientos').select('*').eq('cliente_id', id).order('creado_en', { ascending: false }).limit(30),
        supabase.from('ventas').select('*, venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre))), venta_pagos(metodo, monto)').eq('cliente_id', id).eq('estado', 'completada').order('creado_en', { ascending: false }).limit(20),
        supabase.from('proveedores').select('id, nombre, deuda_total, alias_cbu').eq('activo', true).order('nombre'),
      ])
      if (c) { setCliente(c); setNombre(c.nombre); setTelefono(c.telefono || ''); setDireccion(c.direccion || '') }
      setMovimientos(movs || [])
      setVentas(vs || [])
      setProveedores((provs || []) as Proveedor[])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    const errNombre = validarRequerido(nombre, 'Nombre') || validarMaxLength(nombre, 100, 'Nombre')
    const errTel = validarTelefono(telefono)
    setErrors({ nombre: errNombre, telefono: errTel })
    if (errNombre || errTel) return

    setGuardando(true)
    const { error } = await supabase.from('clientes').update({ nombre, telefono: telefono || null, direccion: direccion || null }).eq('id', id)
    if (error) toast.error('Error al guardar: ' + error.message)
    else { toast.success('Cliente actualizado'); setCliente(prev => prev ? { ...prev, nombre, telefono, direccion } : null) }
    setGuardando(false)
  }

  async function registrarAbono() {
    const monto = parseFloat(montoAbono)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!cliente) return
    if (monto > cliente.deuda_total) { toast.error(`El abono no puede superar la deuda (${formatPrecio(cliente.deuda_total)})`); return }

    const { data, error } = await supabase.rpc('procesar_cobro_deuda', {
      p_cliente_id: id,
      p_monto: Math.round(monto),
      p_metodo: metodoPagoAbono,
      p_notas: notasAbono || null,
      p_proveedor_id: proveedorTransferencia?.id || null,
    })
    if (error) { toast.error('Error al registrar abono: ' + error.message); return }

    const deudaRestante = (data as { deuda_restante: number }).deuda_restante
    setCliente(prev => prev ? { ...prev, deuda_total: deudaRestante } : null)
    setMovimientos(prev => [{
      id: Date.now().toString(),
      cliente_id: id,
      tipo: 'abono',
      monto,
      notas: notasAbono || undefined,
      metodo_pago: metodoPagoAbono,
      creado_en: new Date().toISOString(),
    }, ...prev])

    if (metodoPagoAbono === 'transferencia' && proveedorTransferencia) {
      const nuevaDeudaProv = Math.max(0, proveedorTransferencia.deuda_total - monto)
      setProveedores(prev => prev.map(p => p.id === proveedorTransferencia.id ? { ...p, deuda_total: nuevaDeudaProv } : p))
      toast.success(`Deuda de ${proveedorTransferencia.nombre} reducida en ${formatPrecio(monto)}`, { duration: 4000 })
      setProveedorTransferencia(null)
    }

    setMontoAbono('')
    setNotasAbono('')
    setUltimoAbono({ monto, deudaRestante })
    toast.success(`Abono de ${formatPrecio(monto)} registrado`)
  }

  async function enviarReciboAbono() {
    if (!ultimoAbono || !telefono || !cliente) return
    setEnviandoRecibo(true)
    try {
      // Extraer artículos reales de ventas fiadas
      const ultimasCompras = ventas
        .filter(v => v.venta_pagos?.some(p => p.metodo === 'fiado'))
        .flatMap(v => (v.venta_items || []).map(item => ({
          nombre: item.variante?.producto?.nombre || '—',
          talle: item.variante?.talle || '',
          precio: item.precio_unitario * item.cantidad,
          fecha: new Date(v.creado_en).toLocaleDateString('es-AR'),
        })))
        .slice(0, 8)

      const metodosLabel: Record<string, string> = {
        efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito',
      }

      const reciboData: ReciboAbonoData = {
        clienteNombre: cliente.nombre,
        fecha: new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }),
        montoAbono: ultimoAbono.monto,
        metodoPago: metodosLabel[metodoPagoAbono] || metodoPagoAbono,
        deudaAnterior: ultimoAbono.deudaRestante + ultimoAbono.monto,
        deudaActual: ultimoAbono.deudaRestante,
        ultimasCompras,
      }

      const blob = await generarPDFRecibo(reciboData)
      const resultado = await compartirPDFWhatsApp(blob, `recibo_${new Date().toISOString().slice(0,10)}.pdf`, telefono)
      toast.success(resultado === 'shared' ? 'Recibo enviado' : 'PDF descargado — adjuntalo en el chat de WhatsApp')
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setEnviandoRecibo(false)
    }
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
            {cliente.deuda_total > 0 && <Badge variant="destructive" className="mt-1">Debe {mask(formatPrecio(cliente.deuda_total))}</Badge>}
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
            <div>
              <Label>Nombre</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" maxLength={100} />
              <FieldError message={errors.nombre} />
            </div>
            <div>
              <Label>Teléfono</Label>
              <Input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="3516123456" className="mt-1" />
              <FieldError message={errors.telefono} />
            </div>
            <div><Label>Dirección</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} className="mt-1" /></div>
          </CardContent>
        </Card>

        {/* Fiado */}
        <Card className={cliente.deuda_total > 0 ? 'border-red-200' : ''}>
          <CardHeader><CardTitle className="text-base">Cuenta corriente</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="text-center py-2 rounded-xl bg-gray-50">
              <p className={`text-3xl font-bold ${cliente.deuda_total > 0 ? 'text-red-500' : 'text-green-600'}`}>
                {mask(formatPrecio(cliente.deuda_total))}
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
                    {mask(formatPrecio(Math.max(0, cliente.deuda_total - parseFloat(montoAbono))))}
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

              {/* Selector proveedor (solo con transferencia) */}
              {metodoPagoAbono === 'transferencia' && proveedores.length > 0 && (
                <div>
                  {proveedorTransferencia ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                      <Smartphone size={13} className="text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-blue-700 truncate">{proveedorTransferencia.nombre}</p>
                        <p className="text-xs text-blue-600 font-mono truncate">
                          Alias/CBU: {proveedorTransferencia.alias_cbu || <span className="text-blue-400 italic">sin cargar</span>}
                        </p>
                        <p className="text-xs text-blue-500">
                          Deuda: {mask(formatPrecio(proveedorTransferencia.deuda_total))} → {mask(formatPrecio(Math.max(0, proveedorTransferencia.deuda_total - (parseFloat(montoAbono) || 0))))}
                        </p>
                      </div>
                      <button onClick={() => setProveedorTransferencia(null)} className="text-blue-300 hover:text-blue-600 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={e => {
                        const prov = proveedores.find(p => p.id === e.target.value)
                        if (prov) setProveedorTransferencia(prov)
                      }}
                      className="w-full h-8 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-xs px-2 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="">↗ ¿Va al alias de un proveedor?</option>
                      {proveedores.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}{p.deuda_total > 0 ? ` — debe ${formatPrecio(p.deuda_total)}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

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

              {/* Banner recibo WhatsApp */}
              {ultimoAbono && telefono && (
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-green-50 border border-green-200 mt-2">
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                  <span className="text-xs text-green-700 flex-1">
                    Pago de {formatPrecio(ultimoAbono.monto)} registrado
                  </span>
                  <button
                    onClick={enviarReciboAbono}
                    disabled={enviandoRecibo}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500 text-white text-xs font-medium hover:bg-green-600 transition-colors shrink-0 disabled:opacity-50"
                  >
                    {enviandoRecibo ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                    {enviandoRecibo ? 'Generando...' : 'Enviar recibo PDF'}
                  </button>
                </div>
              )}
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
                      {mov.tipo === 'cargo' ? '+' : '-'} {mask(formatPrecio(mov.monto))}
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
                        <p className="font-bold text-gray-800">{mask(formatPrecio(venta.total))}</p>
                        {venta.descuento > 0 && (
                          <p className="text-xs text-green-600">− {mask(formatPrecio(venta.descuento))} desc.</p>
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
                                  {item.variante?.talle
                                    ? formatNombreConTalle(item.variante?.producto?.nombre || '—', item.variante.talle)
                                    : (item.variante?.producto?.nombre || '—')}
                                </p>
                              </div>
                              <div className="text-right shrink-0 ml-4">
                                {item.cantidad > 1 && (
                                  <p className="text-xs text-gray-400">{item.cantidad} × {mask(formatPrecio(item.precio_unitario))}</p>
                                )}
                                <p className="text-sm font-semibold text-gray-700">
                                  {mask(formatPrecio(item.precio_unitario * item.cantidad))}
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
