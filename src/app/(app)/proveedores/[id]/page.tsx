'use client'

import { useEffect, useState, use, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Proveedor, IngresoMercaderia } from '@/types'

interface ProductoSimple {
  id: string
  nombre: string
  precio_costo: number
  precio_venta: number
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import { ArrowLeft, Save, Plus, FileText, Upload, TrendingUp, TrendingDown, Minus, Pencil, Check, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'
import * as XLSX from 'xlsx'

interface PagoProveedor {
  id: string
  proveedor_id: string
  monto: number
  metodo: string
  notas?: string
  gasto_id?: string
  creado_en: string
}

interface CambioPrecio {
  producto_id: string
  nombre: string
  precio_costo_actual: number
  precio_costo_nuevo: number
  diferencia: number
  diferenciaPct: number
}

function normalizar(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function fuzzyScore(haystack: string, needle: string): number {
  const h = normalizar(haystack)
  const words = normalizar(needle).split(' ').filter(Boolean)
  if (words.length === 0) return 0
  const matches = words.filter(w => h.includes(w))
  return matches.length / words.length
}

export default function ProveedorDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [proveedor, setProveedor] = useState<Proveedor | null>(null)
  const [ingresos, setIngresos] = useState<IngresoMercaderia[]>([])
  const [pagos, setPagos] = useState<PagoProveedor[]>([])
  const [productos, setProductos] = useState<ProductoSimple[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [email, setEmail] = useState('')
  const [direccion, setDireccion] = useState('')
  const [notas, setNotas] = useState('')
  const [aliasCbu, setAliasCbu] = useState('')

  const [montoPago, setMontoPago] = useState('')
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [eliminandoPago, setEliminandoPago] = useState<string | null>(null)

  const [montoDeuda, setMontoDeuda] = useState('')
  const [remitoDeuda, setRemitoDeuda] = useState('')
  const [registrandoDeuda, setRegistrandoDeuda] = useState(false)

  // Lista de precios Excel
  const [cambiosPrecio, setCambiosPrecio] = useState<CambioPrecio[]>([])
  const [aplicandoPrecios, setAplicandoPrecios] = useState(false)

  // Edición inline de precios
  const [editandoPrecio, setEditandoPrecio] = useState<{ productoId: string; campo: 'precio_costo' | 'precio_venta' } | null>(null)
  const [precioEditTemp, setPrecioEditTemp] = useState('')

  const guardarPrecioInline = useCallback(async () => {
    if (!editandoPrecio) return
    const nuevo = parseFloat(precioEditTemp)
    if (isNaN(nuevo) || nuevo < 0) { toast.error('Precio inválido'); setEditandoPrecio(null); return }
    const prod = productos.find(p => p.id === editandoPrecio.productoId)
    if (!prod) { setEditandoPrecio(null); return }
    const actual = prod[editandoPrecio.campo]
    if (nuevo === actual) { setEditandoPrecio(null); return }
    const { error } = await supabase.from('productos').update({ [editandoPrecio.campo]: nuevo }).eq('id', editandoPrecio.productoId)
    if (error) { toast.error(`Error: ${error.message}`); setEditandoPrecio(null); return }
    setProductos(prev => prev.map(p => p.id === editandoPrecio!.productoId ? { ...p, [editandoPrecio!.campo]: nuevo } : p))
    setEditandoPrecio(null)
    toast.success('Precio actualizado')
  }, [editandoPrecio, precioEditTemp, productos, supabase])

  useEffect(() => {
    async function cargar() {
      const [{ data: p }, { data: ing }, { data: pag }, { data: prods }] = await Promise.all([
        supabase.from('marcas').select('*').eq('id', id).single(),
        supabase.from('ingresos_mercaderia').select('*').eq('proveedor_id', id).order('creado_en', { ascending: false }).limit(20),
        supabase.from('pagos_proveedores').select('id, proveedor_id, monto, metodo, notas, gasto_id, creado_en').eq('proveedor_id', id).order('creado_en', { ascending: false }).limit(20),
        supabase.from('productos').select('id, nombre, precio_costo, precio_venta').eq('activo', true).eq('proveedor_id', id).order('nombre'),
      ])
      if (p) {
        setProveedor(p)
        setNombre(p.nombre)
        setTelefono(p.telefono || '')
        setEmail(p.email || '')
        setDireccion(p.direccion || '')
        setNotas(p.notas || '')
        setAliasCbu(p.alias_cbu || '')
      }
      setIngresos(ing || [])
      setPagos(pag || [])
      setProductos(prods || [])
      setLoading(false)
    }
    cargar()
  }, [id, supabase])

  async function guardar() {
    setGuardando(true)
    const { error } = await supabase.from('marcas').update({
      nombre, telefono: telefono || null, email: email || null,
      direccion: direccion || null, notas: notas || null,
      alias_cbu: aliasCbu || null,
    }).eq('id', id)
    if (error) toast.error('Error al guardar')
    else { toast.success('Proveedor actualizado'); setProveedor(prev => prev ? { ...prev, nombre, telefono, email, direccion, notas, alias_cbu: aliasCbu } : null) }
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
    await supabase.from('marcas').update({ deuda_total: nuevaDeuda }).eq('id', id)
    setProveedor(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    setPagos(prev => [{ id: Date.now().toString(), proveedor_id: id, monto, metodo: metodoPago, creado_en: new Date().toISOString() }, ...prev])
    setMontoPago('')
    toast.success(`Pago de ${formatPrecio(monto)} registrado`)
  }

  async function registrarDeuda() {
    const monto = parseFloat(montoDeuda)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!proveedor) return

    setRegistrandoDeuda(true)
    const { data: ing, error } = await supabase.from('ingresos_mercaderia').insert({
      proveedor_id: id,
      numero_remito: remitoDeuda.trim() || null,
      total: monto,
    }).select().single()

    if (error) { toast.error('Error: ' + error.message); setRegistrandoDeuda(false); return }

    const nuevaDeuda = (proveedor.deuda_total || 0) + monto
    await supabase.from('marcas').update({ deuda_total: nuevaDeuda }).eq('id', id)
    setProveedor(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    setIngresos(prev => [ing as IngresoMercaderia, ...prev])
    setMontoDeuda('')
    setRemitoDeuda('')
    toast.success(`Deuda de ${formatPrecio(monto)} registrada`)
    setRegistrandoDeuda(false)
  }

  async function eliminarPago(pago: PagoProveedor) {
    if (!confirm(`¿Eliminar pago de ${formatPrecio(pago.monto)}? Se revertirá la deuda del proveedor.`)) return
    setEliminandoPago(pago.id)

    const { error } = await supabase.from('pagos_proveedores').delete().eq('id', pago.id)
    if (error) { toast.error('Error al eliminar: ' + error.message); setEliminandoPago(null); return }

    if (pago.gasto_id) {
      await supabase.from('gastos').delete().eq('id', pago.gasto_id)
    }

    const { data: marcaActual } = await supabase.from('marcas').select('deuda_total').eq('id', id).single()
    const nuevaDeuda = (marcaActual?.deuda_total || 0) + pago.monto
    await supabase.from('marcas').update({ deuda_total: nuevaDeuda }).eq('id', id)
    setProveedor(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    setPagos(prev => prev.filter(p => p.id !== pago.id))
    setEliminandoPago(null)
    toast.success(`Pago de ${formatPrecio(pago.monto)} eliminado`)
  }

  function procesarExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })

        if (rows.length === 0) { toast.error('El archivo está vacío'); return }

        // Detectar columnas: buscar "precio", "costo", "nombre", "codigo"
        const keys = Object.keys(rows[0])
        const colNombre = keys.find(k => /nombre|product|articulo|descrip/i.test(k))
        const colPrecio = keys.find(k => /precio|costo|cost|price/i.test(k))
        const colCodigo = keys.find(k => /codigo|code|barcode|ean/i.test(k))

        if (!colPrecio) { toast.error('No encontré columna de precio en el Excel. Buscá una columna llamada "precio" o "costo".'); return }
        if (!colNombre && !colCodigo) { toast.error('No encontré columna de nombre o código en el Excel.'); return }

        const cambios: CambioPrecio[] = []

        for (const row of rows) {
          const precioNuevo = parseFloat(String(row[colPrecio]).replace(/[^0-9.,]/g, '').replace(',', '.'))
          if (isNaN(precioNuevo) || precioNuevo <= 0) continue

          let mejorMatch: ProductoSimple | undefined
          let mejorScore = 0

          if (colCodigo && row[colCodigo]) {
            // Match exacto por código primero (no aplica directo a productos sin código, pero puede coincidir con nombre)
          }

          if (colNombre && row[colNombre]) {
            for (const p of productos) {
              const score = fuzzyScore(p.nombre, String(row[colNombre]))
              if (score > mejorScore) { mejorScore = score; mejorMatch = p }
            }
          }

          if (!mejorMatch || mejorScore < 0.5) continue
          if (cambios.find(c => c.producto_id === mejorMatch!.id)) continue

          const diferencia = precioNuevo - mejorMatch.precio_costo
          const diferenciaPct = mejorMatch.precio_costo > 0 ? (diferencia / mejorMatch.precio_costo) * 100 : 0

          cambios.push({
            producto_id: mejorMatch.id,
            nombre: mejorMatch.nombre,
            precio_costo_actual: mejorMatch.precio_costo,
            precio_costo_nuevo: precioNuevo,
            diferencia,
            diferenciaPct,
          })
        }

        if (cambios.length === 0) {
          toast.error('No se encontraron productos coincidentes con los de este proveedor.')
          return
        }

        setCambiosPrecio(cambios)
        toast.success(`${cambios.length} productos detectados`)
      } catch {
        toast.error('Error al leer el archivo Excel')
      }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  async function aplicarCambiosPrecios() {
    setAplicandoPrecios(true)
    let ok = 0
    for (const cambio of cambiosPrecio) {
      const prod = productos.find(p => p.id === cambio.producto_id)
      if (!prod) continue

      // Insertar en historial_precios
      await supabase.from('historial_precios').insert({
        producto_id: cambio.producto_id,
        precio_costo_anterior: cambio.precio_costo_actual,
        precio_venta_anterior: prod.precio_venta,
        precio_costo_nuevo: cambio.precio_costo_nuevo,
        precio_venta_nuevo: prod.precio_venta,
      })

      const { error } = await supabase.from('productos')
        .update({ precio_costo: cambio.precio_costo_nuevo })
        .eq('id', cambio.producto_id)
      if (!error) ok++
    }

    // Refrescar productos locales
    const { data: prods } = await supabase.from('productos').select('id, nombre, precio_costo, precio_venta').eq('activo', true).eq('proveedor_id', id).order('nombre')
    setProductos(prods || [])
    setCambiosPrecio([])
    setAplicandoPrecios(false)
    toast.success(`${ok} precios de costo actualizados`)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>
  if (!proveedor) return <div className="p-8 text-center text-gray-500">Proveedor no encontrado</div>

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header sticky bajo el TopBar */}
      <div className="sticky top-14 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-100 -mx-4 lg:-mx-8 px-4 lg:px-8 py-3 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/proveedores"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
            <div>
              <h1 className="text-xl font-bold text-gray-800">{proveedor.nombre}</h1>
              {proveedor.deuda_total > 0 && (
                <Badge variant="destructive" className="mt-0.5">Deuda: {formatPrecio(proveedor.deuda_total)}</Badge>
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
      </div>

      <div className="space-y-6">
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

      <Tabs defaultValue="datos">
        <TabsList>
          <TabsTrigger value="datos">Datos y pagos</TabsTrigger>
          <TabsTrigger value="precios">Lista de precios</TabsTrigger>
        </TabsList>

        <TabsContent value="datos" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Datos */}
            <Card>
              <CardHeader><CardTitle className="text-base">Datos</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nombre</Label><Input value={nombre} onChange={e => setNombre(e.target.value)} className="mt-1" /></div>
                <div><Label>Teléfono</Label><Input value={telefono} onChange={e => setTelefono(e.target.value)} className="mt-1" /></div>
                <div><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1" /></div>
                <div><Label>Dirección</Label><Input value={direccion} onChange={e => setDireccion(e.target.value)} className="mt-1" /></div>
                <div><Label>Alias / CBU para transferencias</Label><Input value={aliasCbu} onChange={e => setAliasCbu(e.target.value)} placeholder="Ej: proveedor.textil" className="mt-1" /></div>
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
                {metodoPago === 'transferencia' && proveedor.alias_cbu && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-sm">
                    <p className="text-blue-500 text-xs font-medium mb-0.5">Alias / CBU del proveedor</p>
                    <p className="font-mono font-semibold text-blue-800 select-all">{proveedor.alias_cbu}</p>
                  </div>
                )}
                <Button onClick={registrarPago} className="w-full bg-green-500 hover:bg-green-600 gap-2">
                  <Plus size={16} /> Registrar pago
                </Button>
              </CardContent>
            </Card>

            {/* Registrar deuda */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp size={16} className="text-red-400" /> Registrar deuda</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Monto *</Label>
                  <Input type="number" value={montoDeuda} onChange={e => setMontoDeuda(e.target.value)}
                    placeholder="0" className="mt-1" />
                </div>
                <div>
                  <Label>N° Remito (opcional)</Label>
                  <Input value={remitoDeuda} onChange={e => setRemitoDeuda(e.target.value)}
                    placeholder="Ej: 0001-00045" className="mt-1" />
                </div>
                <Button onClick={registrarDeuda} disabled={registrandoDeuda}
                  className="w-full bg-red-500 hover:bg-red-600 gap-2">
                  <Plus size={16} /> {registrandoDeuda ? 'Guardando...' : 'Registrar deuda'}
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
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="capitalize">{pago.metodo}</Badge>
                          {pago.gasto_id && (
                            <Badge variant="outline" className="text-[10px] text-teal-600 border-teal-300 py-0">Desde Gastos</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{new Date(pago.creado_en).toLocaleDateString('es-AR')}</span>
                          {pago.notas && <span className="text-xs text-gray-400 truncate max-w-[180px]">{pago.notas}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-green-600">{formatPrecio(pago.monto)}</p>
                        <button
                          onClick={() => eliminarPago(pago)}
                          disabled={eliminandoPago === pago.id}
                          className="text-gray-300 hover:text-red-400 transition-colors disabled:opacity-50"
                          title="Eliminar pago"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="precios" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Actualizar precios de costo desde Excel</CardTitle>
              <p className="text-sm text-gray-500 mt-1">
                Subí el Excel del proveedor con columnas de nombre del producto y precio nuevo.
                El sistema detecta los cambios automáticamente.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={procesarExcel}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="gap-2 border-teal-300 text-teal-700 hover:bg-teal-50"
                >
                  <Upload size={16} /> Subir Excel / CSV
                </Button>
                {cambiosPrecio.length > 0 && (
                  <span className="text-sm text-gray-500">{cambiosPrecio.length} productos encontrados</span>
                )}
              </div>

              {cambiosPrecio.length > 0 && (
                <>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2.5 text-gray-600 font-medium">Producto</th>
                          <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Costo actual</th>
                          <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Costo nuevo</th>
                          <th className="text-right px-4 py-2.5 text-gray-600 font-medium">Cambio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {cambiosPrecio.map(c => (
                          <tr key={c.producto_id} className="hover:bg-gray-50">
                            <td className="px-4 py-2.5 font-medium text-gray-800">{c.nombre}</td>
                            <td className="px-4 py-2.5 text-right text-gray-500">{formatPrecio(c.precio_costo_actual)}</td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{formatPrecio(c.precio_costo_nuevo)}</td>
                            <td className="px-4 py-2.5 text-right">
                              {c.diferencia === 0 ? (
                                <span className="flex items-center justify-end gap-1 text-gray-400 text-xs"><Minus size={12} /> Sin cambio</span>
                              ) : c.diferencia > 0 ? (
                                <span className="flex items-center justify-end gap-1 text-red-500 text-xs font-medium">
                                  <TrendingUp size={12} /> +{c.diferenciaPct.toFixed(0)}%
                                </span>
                              ) : (
                                <span className="flex items-center justify-end gap-1 text-green-500 text-xs font-medium">
                                  <TrendingDown size={12} /> {c.diferenciaPct.toFixed(0)}%
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex gap-3 justify-end">
                    <Button variant="outline" onClick={() => setCambiosPrecio([])}>Cancelar</Button>
                    <Button
                      onClick={aplicarCambiosPrecios}
                      disabled={aplicandoPrecios}
                      className="bg-teal-500 hover:bg-teal-600"
                    >
                      {aplicandoPrecios ? 'Aplicando...' : `Aplicar ${cambiosPrecio.length} cambios`}
                    </Button>
                  </div>
                </>
              )}

              {/* Productos actuales del proveedor */}
              {productos.length > 0 && cambiosPrecio.length === 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Productos de este proveedor ({productos.length})</p>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="text-left px-4 py-2 text-gray-600 font-medium">Producto</th>
                          <th className="text-right px-4 py-2 text-gray-600 font-medium">Costo</th>
                          <th className="text-right px-4 py-2 text-gray-600 font-medium">Venta</th>
                          <th className="text-right px-4 py-2 text-gray-600 font-medium">Margen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
                        {productos.map(p => {
                          const margen = p.precio_venta > 0 ? ((p.precio_venta - p.precio_costo) / p.precio_venta * 100) : 0
                          const editandoCosto = editandoPrecio?.productoId === p.id && editandoPrecio.campo === 'precio_costo'
                          const editandoVenta = editandoPrecio?.productoId === p.id && editandoPrecio.campo === 'precio_venta'
                          return (
                            <tr key={p.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2 text-gray-800">{p.nombre}</td>
                              <td className="px-4 py-2 text-right">
                                {editandoCosto ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      value={precioEditTemp}
                                      onChange={e => setPrecioEditTemp(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') guardarPrecioInline(); if (e.key === 'Escape') setEditandoPrecio(null) }}
                                      onBlur={guardarPrecioInline}
                                      autoFocus
                                      className="w-24 text-right text-sm border border-teal-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditandoPrecio({ productoId: p.id, campo: 'precio_costo' }); setPrecioEditTemp(p.precio_costo.toString()) }}
                                    className="text-gray-600 hover:text-teal-600 inline-flex items-center gap-1 group"
                                    title="Editar costo"
                                  >
                                    {formatPrecio(p.precio_costo)}
                                    <Pencil size={10} className="text-gray-300 group-hover:text-teal-400 transition-colors" />
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {editandoVenta ? (
                                  <div className="flex items-center justify-end gap-1">
                                    <input
                                      type="number"
                                      value={precioEditTemp}
                                      onChange={e => setPrecioEditTemp(e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') guardarPrecioInline(); if (e.key === 'Escape') setEditandoPrecio(null) }}
                                      onBlur={guardarPrecioInline}
                                      autoFocus
                                      className="w-24 text-right text-sm border border-teal-400 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-teal-400"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => { setEditandoPrecio({ productoId: p.id, campo: 'precio_venta' }); setPrecioEditTemp(p.precio_venta.toString()) }}
                                    className="text-gray-600 hover:text-teal-600 inline-flex items-center gap-1 group"
                                    title="Editar precio venta"
                                  >
                                    {formatPrecio(p.precio_venta)}
                                    <Pencil size={10} className="text-gray-300 group-hover:text-teal-400 transition-colors" />
                                  </button>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right">
                                <span className={`text-xs font-medium ${margen < 20 ? 'text-red-500' : margen < 35 ? 'text-amber-500' : 'text-green-600'}`}>
                                  {margen.toFixed(0)}%
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {productos.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">
                  No hay productos asociados a este proveedor aún.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </div>
  )
}
