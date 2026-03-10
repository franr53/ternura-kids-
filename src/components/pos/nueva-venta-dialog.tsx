'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente, Producto, Variante, MetodoPago } from '@/types'
import { ItemCarrito } from '@/app/(app)/pos/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { formatPrecio, cn } from '@/lib/utils'
import { confirmarVenta } from '@/lib/services/ventas'
import {
  X, Search, Plus, Minus, User,
  Banknote, CreditCard, Smartphone, HandCoins,
  CheckCircle, ShoppingCart, AlertTriangle, Pencil, ArrowRight,
} from 'lucide-react'

type VarianteConProducto = Variante & {
  producto: Producto & { categoria?: { nombre: string; color: string } }
}

interface Pago {
  metodo: MetodoPago
  monto: number
}

interface Props {
  onCerrar: () => void
  onVentaCompletada: () => void
}

const METODOS: { key: MetodoPago; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'efectivo',      label: 'Efectivo',    icon: <Banknote size={15} />,    color: 'bg-green-100 border-green-400 text-green-700' },
  { key: 'transferencia', label: 'Transfer.',   icon: <Smartphone size={15} />,  color: 'bg-blue-100 border-blue-400 text-blue-700' },
  { key: 'debito',        label: 'Débito',      icon: <CreditCard size={15} />,  color: 'bg-indigo-100 border-indigo-400 text-indigo-700' },
  { key: 'credito',       label: 'Crédito',     icon: <CreditCard size={15} />,  color: 'bg-purple-100 border-purple-400 text-purple-700' },
  { key: 'fiado',         label: 'Fiado',       icon: <HandCoins size={15} />,   color: 'bg-orange-100 border-orange-400 text-orange-700' },
]

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function fuzzyMatch(texto: string, query: string): boolean {
  const t = normalizar(texto)
  return normalizar(query).split(/\s+/).filter(Boolean).every(w => t.includes(w))
}

function matchVariante(v: VarianteConProducto, query: string): boolean {
  const q = query.trim()
  if (v.codigo_barras && v.codigo_barras.includes(q)) return true
  return fuzzyMatch(v.producto.nombre, q)
}

export default function NuevaVentaDialog({ onCerrar, onVentaCompletada }: Props) {
  const supabase = createClient()

  // Data
  const [todasVariantes, setTodasVariantes] = useState<VarianteConProducto[]>([])
  const [todosClientes, setTodosClientes] = useState<Cliente[]>([])
  const [loadingData, setLoadingData] = useState(true)

  // Venta state
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [descuento, setDescuento] = useState(0)
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo')

  // Search state
  const [busProducto, setBusProducto] = useState('')
  const [busCliente, setBusCliente] = useState('')
  const [mostrarDropCliente, setMostrarDropCliente] = useState(false)

  // UI
  const [loading, setLoading] = useState(false)

  // Edición de precio
  const [editandoPrecioIdx, setEditandoPrecioIdx] = useState<number | null>(null)
  const [precioTemporal, setPrecioTemporal] = useState('')
  const [modalPrecio, setModalPrecio] = useState<{
    idx: number
    precioAnterior: number
    nuevoPrecio: number
    varianteId: string
    productoId: string
    productoNombre: string
    talle: string
  } | null>(null)
  const [aplicandoPrecio, setAplicandoPrecio] = useState(false)

  useEffect(() => {
    async function cargar() {
      setLoadingData(true)
      const [{ data: variantes }, { data: clientes }] = await Promise.all([
        supabase
          .from('variantes')
          .select('*, producto:productos(*, categoria:categorias(nombre, color))')
          .order('talle')
          .limit(500),
        supabase.from('clientes').select('*').eq('activo', true).order('nombre'),
      ])
      setTodasVariantes((variantes || []).filter((v) => v.producto?.activo) as VarianteConProducto[])
      setTodosClientes(clientes || [])
      setLoadingData(false)
    }
    cargar()
  }, [])

  // Derived
  const resultadosProducto = busProducto.trim()
    ? todasVariantes.filter(v => matchVariante(v, busProducto)).slice(0, 30)
    : []

  const resultadosCliente = busCliente.trim()
    ? todosClientes.filter(c => fuzzyMatch(c.nombre, busCliente)).slice(0, 8)
    : todosClientes.slice(0, 6)

  const subtotal = carrito.reduce((s, i) => s + i.precio * (1 - i.descuentoItem / 100) * i.cantidad, 0)
  const montoDesc = subtotal * (descuento / 100)
  const total = subtotal - montoDesc

  function agregarAlCarrito(variante: VarianteConProducto) {
    const idx = carrito.findIndex(i => i.varianteId === variante.id)
    if (idx >= 0) {
      setCarrito(prev => prev.map((item, i) =>
        i === idx ? { ...item, cantidad: item.cantidad + 1 } : item
      ))
    } else {
      setCarrito(prev => [...prev, {
        varianteId: variante.id,
        productoId: variante.producto.id,
        productoNombre: variante.producto.nombre,
        talle: variante.talle,
        codigoBarras: variante.codigo_barras,
        precio: variante.precio_venta ?? variante.producto.precio_venta,
        descuentoItem: 0,
        cantidad: 1,
      }])
    }
    setBusProducto('')
    if (variante.stock <= 0) {
      toast.warning(`${variante.producto.nombre} T${variante.talle} — sin stock registrado`, { duration: 2000 })
    } else {
      toast.success(`${variante.producto.nombre} T${variante.talle} agregado`, { duration: 1200 })
    }
  }

  function cambiarCantidad(idx: number, delta: number) {
    setCarrito(prev =>
      prev.map((item, i) => i === idx ? { ...item, cantidad: item.cantidad + delta } : item)
         .filter(item => item.cantidad > 0)
    )
  }

  function eliminarItem(idx: number) {
    setCarrito(prev => prev.filter((_, i) => i !== idx))
  }

  function iniciarEditPrecio(idx: number) {
    setEditandoPrecioIdx(idx)
    setPrecioTemporal(carrito[idx].precio.toString())
  }

  function confirmarEditPrecio(idx: number) {
    const nuevo = parseFloat(precioTemporal)
    if (isNaN(nuevo) || nuevo <= 0) { setEditandoPrecioIdx(null); return }
    const item = carrito[idx]
    if (nuevo === item.precio) { setEditandoPrecioIdx(null); return }
    setEditandoPrecioIdx(null)
    setModalPrecio({
      idx,
      precioAnterior: item.precio,
      nuevoPrecio: nuevo,
      varianteId: item.varianteId,
      productoId: item.productoId || '',
      productoNombre: item.productoNombre,
      talle: item.talle,
    })
  }

  function aplicarSoloVenta() {
    if (!modalPrecio) return
    setCarrito(prev => prev.map((item, i) =>
      i === modalPrecio.idx ? { ...item, precio: modalPrecio.nuevoPrecio } : item
    ))
    setModalPrecio(null)
    toast.success('Precio actualizado solo para esta venta')
  }

  async function aplicarPrecio(alcance: 'variante' | 'todas_variantes' | 'producto') {
    if (!modalPrecio) return
    setAplicandoPrecio(true)
    const { nuevoPrecio, varianteId, productoId, idx } = modalPrecio
    try {
      if (alcance === 'variante') {
        await supabase.from('variantes').update({ precio_venta: nuevoPrecio }).eq('id', varianteId)
        toast.success(`Precio de T.${modalPrecio.talle} actualizado`)
      } else if (alcance === 'todas_variantes') {
        await supabase.from('variantes').update({ precio_venta: nuevoPrecio }).eq('producto_id', productoId)
        toast.success('Precio de todas las tallas actualizado')
      } else {
        await supabase.from('productos').update({ precio_venta: nuevoPrecio }).eq('id', productoId)
        await supabase.from('variantes').update({ precio_venta: null }).eq('producto_id', productoId)
        toast.success('Precio base del producto actualizado')
      }
      setCarrito(prev => prev.map((item, i) =>
        i === idx ? { ...item, precio: nuevoPrecio } : item
      ))
    } catch {
      toast.error('Error al actualizar el precio')
    } finally {
      setAplicandoPrecio(false)
      setModalPrecio(null)
    }
  }

  async function handleConfirmarVenta() {
    if (carrito.length === 0) return
    if (metodoPago === 'fiado' && !cliente) {
      toast.error('Para registrar fiado necesitás seleccionar un cliente')
      return
    }
    setLoading(true)
    try {
      const resultado = await confirmarVenta({
        supabase,
        carrito,
        pagos: [{ metodo: metodoPago, monto: total }],
        subtotal,
        descuento: montoDesc,
        total,
        cliente,
      })

      if (!resultado.ok) { toast.error(resultado.error); return }

      toast.success(`Venta registrada — ${formatPrecio(total)}`)
      onVentaCompletada()
      onCerrar()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col relative">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ShoppingCart size={20} className="text-teal-500" />
            <h2 className="text-lg font-bold text-gray-800">Nueva Venta</h2>
            {carrito.length > 0 && (
              <Badge className="bg-teal-500">{carrito.length} {carrito.length === 1 ? 'item' : 'items'}</Badge>
            )}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex min-h-0">

          {/* Panel izquierdo: Productos */}
          <div className="flex-1 flex flex-col border-r border-gray-100 overflow-hidden">

            {/* Búsqueda de producto */}
            <div className="p-4 border-b border-gray-50 space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder={loadingData ? 'Cargando productos...' : 'Buscar producto por nombre...'}
                  value={busProducto}
                  onChange={e => setBusProducto(e.target.value)}
                  className="pl-9 text-sm"
                  autoFocus
                  disabled={loadingData}
                />
              </div>

              {/* Resultados de búsqueda */}
              {busProducto.trim() && (
                <div className="border border-gray-200 rounded-lg max-h-52 overflow-y-auto">
                  {resultadosProducto.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">
                      Sin resultados para &ldquo;{busProducto}&rdquo;
                    </p>
                  ) : (
                    resultadosProducto.map(v => (
                      <button
                        key={v.id}
                        onClick={() => agregarAlCarrito(v)}
                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-teal-50 text-left border-b border-gray-50 last:border-0 transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 truncate">{v.producto.nombre}</p>
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-gray-500">T. {v.talle}</p>
                            {v.stock <= 0
                              ? <span className="text-xs text-orange-500 font-medium">⚠ Sin stock</span>
                              : <span className="text-xs text-gray-400">Stock: {v.stock}</span>
                            }
                            {v.producto.categoria && (
                              <span
                                className="text-xs px-1 py-0.5 rounded text-white"
                                style={{ backgroundColor: v.producto.categoria.color }}
                              >
                                {v.producto.categoria.nombre}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 ml-3 flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-800">
                            {formatPrecio(v.precio_venta ?? v.producto.precio_venta)}
                          </span>
                          <Plus size={14} className="text-teal-400" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Carrito */}
            <div className="flex-1 overflow-y-auto p-4">
              {carrito.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300 select-none">
                  <ShoppingCart size={44} />
                  <p className="text-sm mt-2">Carrito vacío</p>
                  <p className="text-xs mt-0.5">Buscá un producto arriba para agregar</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {carrito.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-800 truncate">{item.productoNombre}</p>
                        <p className="text-xs text-gray-500">T. {item.talle}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => cambiarCantidad(idx, -1)}
                          className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:border-teal-400 hover:text-teal-500 transition-colors"
                        >
                          <Minus size={11} />
                        </button>
                        <span className="w-6 text-center text-sm font-semibold">{item.cantidad}</span>
                        <button
                          onClick={() => cambiarCantidad(idx, 1)}
                          className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center hover:border-teal-400 hover:text-teal-500 transition-colors"
                        >
                          <Plus size={11} />
                        </button>
                      </div>

                      {/* Precio editable */}
                      {editandoPrecioIdx === idx ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            value={precioTemporal}
                            onChange={e => setPrecioTemporal(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') confirmarEditPrecio(idx)
                              if (e.key === 'Escape') setEditandoPrecioIdx(null)
                            }}
                            onBlur={() => confirmarEditPrecio(idx)}
                            autoFocus
                            className="w-24 text-right text-sm font-semibold border border-teal-400 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-400"
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEditPrecio(idx)}
                          className="flex items-center gap-1 text-sm font-semibold text-gray-800 w-20 text-right shrink-0 hover:text-teal-600 transition-colors group/precio"
                          title="Editar precio"
                        >
                          <span>{formatPrecio(item.precio * item.cantidad)}</span>
                          <Pencil size={11} className="text-gray-300 group-hover/precio:text-teal-400 transition-colors shrink-0" />
                        </button>
                      )}

                      <button
                        onClick={() => eliminarItem(idx)}
                        className="text-gray-300 hover:text-red-400 transition-colors shrink-0"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Panel derecho: Cliente + Resumen + Pago */}
          <div className="w-72 flex flex-col overflow-y-auto p-4 space-y-4">

            {/* Cliente */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Cliente (opcional)</p>
              {cliente ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-teal-50 border border-teal-200">
                  <User size={14} className="text-teal-500 shrink-0" />
                  <span className="text-sm font-medium text-teal-700 flex-1 truncate">{cliente.nombre}</span>
                  {cliente.deuda_total > 0 && (
                    <span className="text-xs text-red-500 flex items-center gap-0.5">
                      <AlertTriangle size={10} />
                      {formatPrecio(cliente.deuda_total)}
                    </span>
                  )}
                  <button onClick={() => setCliente(null)} className="text-teal-300 hover:text-teal-600">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input
                    placeholder="Buscar cliente..."
                    value={busCliente}
                    onChange={e => { setBusCliente(e.target.value); setMostrarDropCliente(true) }}
                    onFocus={() => setMostrarDropCliente(true)}
                    onBlur={() => setTimeout(() => setMostrarDropCliente(false), 150)}
                    className="pl-8 text-sm h-9"
                  />
                  {mostrarDropCliente && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-44 overflow-y-auto">
                      {resultadosCliente.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-3">Sin clientes</p>
                      ) : (
                        resultadosCliente.map(c => (
                          <button
                            key={c.id}
                            onMouseDown={() => { setCliente(c); setBusCliente(''); setMostrarDropCliente(false) }}
                            className="w-full flex items-center justify-between px-3 py-2 hover:bg-teal-50 text-left border-b border-gray-50 last:border-0"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{c.nombre}</p>
                              {c.telefono && <p className="text-xs text-gray-400">{c.telefono}</p>}
                            </div>
                            {c.deuda_total > 0 && (
                              <span className="text-xs text-red-500 shrink-0 ml-1">{formatPrecio(c.deuda_total)}</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            <Separator />

            {/* Descuento */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-1.5">Descuento</p>
              <div className="flex gap-1.5">
                {[0, 10, 15, 20].map(d => (
                  <button
                    key={d}
                    onClick={() => setDescuento(d)}
                    className={cn(
                      'flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors',
                      descuento === d
                        ? 'bg-teal-100 border-teal-400 text-teal-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {d === 0 ? 'Sin desc.' : `${d}%`}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumen */}
            <div className="space-y-1.5 text-sm bg-gray-50 rounded-xl p-3">
              <div className="flex justify-between text-gray-600">
                <span>Subtotal</span>
                <span>{formatPrecio(subtotal)}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-green-600 text-xs">
                  <span>Descuento {descuento}%</span>
                  <span>− {formatPrecio(montoDesc)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base pt-1 border-t border-gray-200">
                <span>Total</span>
                <span className="text-teal-600">{formatPrecio(total)}</span>
              </div>
            </div>

            <Separator />

            {/* Método de pago */}
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">Método de pago</p>
              <div className="grid grid-cols-3 gap-1.5">
                {METODOS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPago(m.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-all',
                      metodoPago === m.key
                        ? m.color + ' border-2'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300 bg-white'
                    )}
                  >
                    {m.icon}
                    <span className="leading-tight text-center">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Modal cambio de precio */}
        {modalPrecio && (
          <div className="absolute inset-0 z-10 bg-black/40 flex items-center justify-center rounded-2xl">
            <div className="bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                  <Pencil size={18} className="text-teal-600" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-800 text-base">Cambio de precio</h3>
                  <p className="text-sm text-gray-500 mt-0.5">
                    <span className="font-medium text-gray-700">{modalPrecio.productoNombre}</span>
                    {modalPrecio.talle && <span className="text-gray-400"> · T. {modalPrecio.talle}</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm text-gray-400 line-through">{formatPrecio(modalPrecio.precioAnterior)}</span>
                    <ArrowRight size={14} className="text-gray-300" />
                    <span className="text-sm font-bold text-teal-600">{formatPrecio(modalPrecio.nuevoPrecio)}</span>
                  </div>
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">¿Dónde aplicar el cambio?</p>

              <div className="space-y-2">
                <button
                  onClick={aplicarSoloVenta}
                  disabled={aplicandoPrecio}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                >
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700">Solo esta venta</p>
                  <p className="text-xs text-gray-400 mt-0.5">No modifica el inventario</p>
                </button>
                <button
                  onClick={() => aplicarPrecio('variante')}
                  disabled={aplicandoPrecio}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                >
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700">Esta talla (T. {modalPrecio.talle})</p>
                  <p className="text-xs text-gray-400 mt-0.5">Actualiza solo esta variante en el inventario</p>
                </button>
                <button
                  onClick={() => aplicarPrecio('todas_variantes')}
                  disabled={aplicandoPrecio}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                >
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700">Todas las tallas</p>
                  <p className="text-xs text-gray-400 mt-0.5">Actualiza todas las variantes de {modalPrecio.productoNombre}</p>
                </button>
                <button
                  onClick={() => aplicarPrecio('producto')}
                  disabled={aplicandoPrecio}
                  className="w-full text-left px-4 py-3 rounded-xl border-2 border-gray-200 hover:border-teal-400 hover:bg-teal-50 transition-all group"
                >
                  <p className="text-sm font-semibold text-gray-800 group-hover:text-teal-700">Precio base del producto</p>
                  <p className="text-xs text-gray-400 mt-0.5">Actualiza el producto y resetea precios de variantes</p>
                </button>
              </div>

              <button
                onClick={() => setModalPrecio(null)}
                className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 py-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex gap-3">
          <Button variant="outline" onClick={onCerrar} className="flex-1">
            Cancelar
          </Button>
          <Button
            onClick={handleConfirmarVenta}
            disabled={carrito.length === 0 || loading}
            className="flex-[2] bg-teal-500 hover:bg-teal-600 text-white font-semibold gap-2 h-11"
          >
            <CheckCircle size={18} />
            {loading ? 'Registrando...' : `Cobrar${carrito.length > 0 ? ` ${formatPrecio(total)}` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  )
}
