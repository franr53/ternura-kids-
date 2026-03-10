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
  CheckCircle, ShoppingCart, AlertTriangle,
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
      <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl max-h-[92vh] flex flex-col">

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
                    <div key={idx} className="flex items-center gap-3 p-2.5 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
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
                      <p className="text-sm font-semibold text-gray-800 w-20 text-right shrink-0">
                        {formatPrecio(item.precio * item.cantidad)}
                      </p>
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
