'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Variante, Producto, Cliente, MetodoPago } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Search, Trash2, Plus, Minus, ShoppingCart, X,
  Barcode, User, Percent, CreditCard, HandCoins
} from 'lucide-react'
import { formatPrecio, cn } from '@/lib/utils'
import { confirmarVenta } from '@/lib/services/ventas'
import BuscadorProducto from '@/components/pos/buscador-producto'
import PagoDialog from '@/components/pos/pago-dialog'
import ClienteSelector from '@/components/pos/cliente-selector'
import NuevaVentaDialog from '@/components/pos/nueva-venta-dialog'

export interface ItemCarrito {
  varianteId: string
  productoNombre: string
  talle: string
  codigoBarras?: string
  precio: number
  descuentoItem: number
  cantidad: number
}

export default function PosPage() {
  const supabase = createClient()
  const [carrito, setCarrito] = useState<ItemCarrito[]>([])
  const [descuentoGlobal, setDescuentoGlobal] = useState(0)
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [mostrarPago, setMostrarPago] = useState(false)
  const [mostrarBuscador, setMostrarBuscador] = useState(false)
  const [mostrarCliente, setMostrarCliente] = useState(false)
  const [mostrarNuevaVenta, setMostrarNuevaVenta] = useState(false)
  const [mostrarCobrarDeuda, setMostrarCobrarDeuda] = useState(false)
  const [montoDeuda, setMontoDeuda] = useState('')
  const [registrandoDeuda, setRegistrandoDeuda] = useState(false)
  const [inputCodigo, setInputCodigo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [carrito])

  const agregarPorCodigo = useCallback(async (codigo: string) => {
    if (!codigo.trim()) return
    const { data } = await supabase
      .from('variantes')
      .select('*, producto:productos(nombre, precio_venta)')
      .eq('codigo_barras', codigo.trim())
      .single()
    if (!data) { toast.error('Código no encontrado'); return }
    agregarAlCarrito(data)
    setInputCodigo('')
  }, [supabase])

  function agregarAlCarrito(variante: Variante & { producto?: Partial<Producto> }) {
    const existente = carrito.findIndex(i => i.varianteId === variante.id)
    if (existente >= 0) {
      setCarrito(prev => prev.map((item, idx) =>
        idx === existente ? { ...item, cantidad: item.cantidad + 1 } : item
      ))
    } else {
      setCarrito(prev => [...prev, {
        varianteId: variante.id,
        productoNombre: variante.producto?.nombre || 'Producto',
        talle: variante.talle,
        codigoBarras: variante.codigo_barras,
        precio: variante.precio_venta ?? variante.producto?.precio_venta ?? 0,
        descuentoItem: 0,
        cantidad: 1,
      }])
    }
    toast.success(`${variante.producto?.nombre} T${variante.talle} agregado`, { duration: 1500 })
  }

  function cambiarCantidad(idx: number, delta: number) {
    setCarrito(prev => prev
      .map((item, i) => i === idx ? { ...item, cantidad: item.cantidad + delta } : item)
      .filter(item => item.cantidad > 0)
    )
  }

  function eliminarItem(idx: number) {
    setCarrito(prev => prev.filter((_, i) => i !== idx))
  }

  function setDescuentoItem(idx: number, desc: number) {
    setCarrito(prev => prev.map((item, i) => i === idx ? { ...item, descuentoItem: Math.min(desc, 100) } : item))
  }

  function limpiarCarrito() {
    setCarrito([])
    setDescuentoGlobal(0)
    setClienteSeleccionado(null)
  }

  const subtotalItems = carrito.reduce((sum, item) => {
    return sum + item.precio * (1 - item.descuentoItem / 100) * item.cantidad
  }, 0)
  const montoDescGlobal = subtotalItems * (descuentoGlobal / 100)
  const total = subtotalItems - montoDescGlobal

  function abrirWhatsApp(comprobante: string) {
    if (!clienteSeleccionado?.telefono) return
    const telefono = clienteSeleccionado.telefono.replace(/\D/g, '')
    window.open(`https://wa.me/54${telefono}?text=${encodeURIComponent(comprobante)}`, '_blank')
  }

  async function cobrarDeuda() {
    const monto = parseFloat(montoDeuda)
    if (!monto || monto <= 0 || !clienteSeleccionado) return
    setRegistrandoDeuda(true)
    await supabase.from('fiado_movimientos').insert({ cliente_id: clienteSeleccionado.id, tipo: 'abono', monto, notas: 'Cobrado desde POS' })
    const nuevaDeuda = Math.max(0, (clienteSeleccionado.deuda_total || 0) - monto)
    await supabase.from('clientes').update({ deuda_total: nuevaDeuda }).eq('id', clienteSeleccionado.id)
    setClienteSeleccionado(prev => prev ? { ...prev, deuda_total: nuevaDeuda } : null)
    toast.success(`Pago de ${formatPrecio(monto)} registrado`)
    setMontoDeuda('')
    setMostrarCobrarDeuda(false)
    setRegistrandoDeuda(false)
  }

  return (
    <div className="h-full flex overflow-hidden bg-gray-50">

      {/* Panel izquierdo */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-5 py-3 flex items-center gap-3">
          <h1 className="text-base font-bold text-gray-800">Punto de Venta</h1>
          {carrito.length > 0 && (
            <span className="bg-teal-100 text-teal-700 text-xs font-semibold px-2 py-0.5 rounded-full">
              {carrito.reduce((s, i) => s + i.cantidad, 0)} items
            </span>
          )}
          <button
            onClick={() => setMostrarNuevaVenta(true)}
            className="ml-auto flex items-center gap-1.5 bg-teal-500 hover:bg-teal-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} /> Nueva venta
          </button>
        </div>

        {/* Buscador */}
        <div className="px-4 pt-4 pb-2">
          <div className="relative">
            <Barcode size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              ref={inputRef}
              placeholder="Escanear código de barras…"
              value={inputCodigo}
              onChange={e => setInputCodigo(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && agregarPorCodigo(inputCodigo)}
              className="pl-9 pr-10 bg-white text-sm"
            />
            <button
              onClick={() => setMostrarBuscador(true)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-teal-500 hover:bg-teal-50 rounded transition-colors"
              title="Buscar por nombre"
            >
              <Search size={15} />
            </button>
          </div>
        </div>

        {/* Carrito */}
        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300 select-none">
              <ShoppingCart size={56} strokeWidth={1} />
              <p className="mt-3 text-sm font-medium">Carrito vacío</p>
              <p className="text-xs mt-1">Escaneá un código o usá el buscador</p>
            </div>
          ) : (
            carrito.map((item, idx) => {
              const precioFinal = item.precio * (1 - item.descuentoItem / 100)
              return (
                <div key={idx} className="bg-white rounded-xl border border-gray-100 p-3 shadow-sm">
                  <div className="flex items-start gap-3">
                    {/* Talle badge */}
                    <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold text-teal-600 leading-none text-center">T{item.talle}</span>
                    </div>
                    {/* Nombre */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 leading-tight truncate">{item.productoNombre}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{formatPrecio(item.precio)} c/u</p>
                    </div>
                    {/* Precio total */}
                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800 text-sm">{formatPrecio(precioFinal * item.cantidad)}</p>
                      {item.descuentoItem > 0 && (
                        <p className="text-[10px] text-teal-500 font-medium">−{item.descuentoItem}%</p>
                      )}
                    </div>
                    <button onClick={() => eliminarItem(idx)} className="text-gray-200 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                      <X size={14} />
                    </button>
                  </div>
                  {/* Cantidad y descuento */}
                  <div className="flex items-center justify-between mt-2.5 pl-12">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => cambiarCantidad(idx, -1)}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-teal-100 hover:text-teal-700 flex items-center justify-center transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="w-7 text-center font-bold text-sm text-gray-700">{item.cantidad}</span>
                      <button
                        onClick={() => cambiarCantidad(idx, 1)}
                        className="w-6 h-6 rounded-full bg-gray-100 hover:bg-teal-100 hover:text-teal-700 flex items-center justify-center transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400">
                      <Percent size={10} />
                      <input
                        type="number"
                        value={item.descuentoItem || ''}
                        onChange={e => setDescuentoItem(idx, parseFloat(e.target.value) || 0)}
                        placeholder="0"
                        className="w-10 text-center text-xs border border-gray-200 rounded-md px-1 py-0.5 focus:outline-none focus:border-teal-400"
                        min={0} max={100}
                      />
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Panel derecho */}
      <div className="w-72 bg-white border-l border-gray-100 flex flex-col shadow-sm">

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Cliente */}
          <div>
            <button
              onClick={() => setMostrarCliente(true)}
              className={cn(
                'w-full flex items-center gap-2 p-3 rounded-xl border text-sm transition-all',
                clienteSeleccionado
                  ? 'border-teal-200 bg-teal-50 text-teal-800'
                  : 'border-dashed border-gray-200 text-gray-400 hover:border-teal-300 hover:bg-teal-50/50'
              )}
            >
              <User size={15} className={clienteSeleccionado ? 'text-teal-500' : 'text-gray-300'} />
              <span className={cn('flex-1 text-left', clienteSeleccionado ? 'font-medium' : '')}>
                {clienteSeleccionado ? clienteSeleccionado.nombre : 'Agregar cliente'}
              </span>
              {clienteSeleccionado && (
                <button
                  onClick={e => { e.stopPropagation(); setClienteSeleccionado(null) }}
                  className="text-teal-400 hover:text-red-400"
                >
                  <X size={13} />
                </button>
              )}
            </button>
            {clienteSeleccionado != null && (clienteSeleccionado.deuda_total ?? 0) > 0 && (
              <button
                onClick={() => setMostrarCobrarDeuda(true)}
                className="mt-1.5 w-full flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-700 px-1 py-1 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <HandCoins size={12} />
                Cobrar fiado — {formatPrecio(clienteSeleccionado.deuda_total ?? 0)}
              </button>
            )}
            {mostrarCobrarDeuda && clienteSeleccionado && (
              <div className="mt-2 p-3 rounded-xl border border-orange-200 bg-orange-50 space-y-2">
                <p className="text-xs font-semibold text-orange-800">Cobro de fiado</p>
                <div className="text-xs text-gray-600 flex justify-between">
                  <span>Deuda actual</span>
                  <span className="font-bold text-red-500">{formatPrecio(clienteSeleccionado.deuda_total)}</span>
                </div>
                {montoDeuda && parseFloat(montoDeuda) > 0 && (
                  <div className="text-xs text-gray-600 flex justify-between">
                    <span>Saldo resultante</span>
                    <span className="font-bold text-green-600">
                      {formatPrecio(Math.max(0, clienteSeleccionado.deuda_total - parseFloat(montoDeuda)))}
                    </span>
                  </div>
                )}
                <Input
                  type="number"
                  value={montoDeuda}
                  onChange={e => setMontoDeuda(e.target.value)}
                  placeholder="Monto a cobrar"
                  className="h-8 text-sm bg-white"
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={cobrarDeuda} disabled={registrandoDeuda || !montoDeuda}
                    className="flex-1 bg-green-500 hover:bg-green-600 h-8 text-xs">
                    {registrandoDeuda ? 'Registrando...' : 'Confirmar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setMostrarCobrarDeuda(false); setMontoDeuda('') }}
                    className="h-8 text-xs">Cancelar</Button>
                </div>
              </div>
            )}
          </div>

          {/* Descuento global */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 block">Descuento general</label>
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Input
                  type="number"
                  value={descuentoGlobal || ''}
                  onChange={e => setDescuentoGlobal(Math.min(parseFloat(e.target.value) || 0, 100))}
                  placeholder="0"
                  className="h-8 text-sm pr-6"
                  min={0} max={100}
                />
                <Percent size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              {[10, 15, 20, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setDescuentoGlobal(descuentoGlobal === d ? 0 : d)}
                  className={cn(
                    'text-xs px-2 py-1.5 rounded-lg border transition-colors',
                    descuentoGlobal === d
                      ? 'bg-teal-500 border-teal-500 text-white'
                      : 'border-gray-200 text-gray-500 hover:border-teal-300'
                  )}
                >
                  {d}%
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Totales */}
          <div className="space-y-2">
            {carrito.length > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Subtotal</span>
                <span>{formatPrecio(subtotalItems)}</span>
              </div>
            )}
            {descuentoGlobal > 0 && (
              <div className="flex justify-between text-sm text-teal-600 font-medium">
                <span>Descuento {descuentoGlobal}%</span>
                <span>−{formatPrecio(montoDescGlobal)}</span>
              </div>
            )}
          </div>

          {/* Total prominente */}
          <div className="rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, #4EC3BD, #0d9488)' }}>
            <div className="px-4 py-5 text-center">
              <p className="text-teal-100 text-xs font-medium uppercase tracking-widest mb-1">Total</p>
              <p className="text-white text-4xl font-bold tracking-tight">
                {formatPrecio(total)}
              </p>
              {descuentoGlobal > 0 && (
                <p className="text-teal-200 text-xs mt-1.5">Ahorrás {formatPrecio(montoDescGlobal)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Botones */}
        <div className="p-4 border-t border-gray-50 space-y-2">
          <Button
            onClick={() => setMostrarPago(true)}
            disabled={carrito.length === 0}
            className="w-full bg-teal-500 hover:bg-teal-600 h-12 text-base font-bold gap-2 shadow-md shadow-teal-100"
          >
            <CreditCard size={18} />
            {carrito.length > 0 ? `Cobrar ${formatPrecio(total)}` : 'Cobrar'}
          </Button>
          {carrito.length > 0 && (
            <button
              onClick={limpiarCarrito}
              className="w-full flex items-center justify-center gap-2 text-xs text-gray-400 hover:text-red-400 py-1.5 transition-colors"
            >
              <Trash2 size={12} /> Vaciar carrito
            </button>
          )}
        </div>
      </div>

      {/* Dialogs */}
      {mostrarBuscador && <BuscadorProducto onSeleccionar={agregarAlCarrito} onCerrar={() => setMostrarBuscador(false)} />}
      {mostrarPago && (
        <PagoDialog
          carrito={carrito}
          total={total}
          descuentoGlobal={descuentoGlobal}
          subtotal={subtotalItems}
          cliente={clienteSeleccionado}
          onConfirmar={async (pagos) => {
            const resultado = await confirmarVenta({ supabase, carrito, pagos, subtotal: subtotalItems, descuento: montoDescGlobal, total, cliente: clienteSeleccionado })
            if (!resultado.ok) { toast.error(resultado.error); return }
            toast.success(`Venta registrada — ${formatPrecio(total)}`)
            setMostrarPago(false)
            if (resultado.comprobante) abrirWhatsApp(resultado.comprobante)
            limpiarCarrito()
          }}
          onCerrar={() => setMostrarPago(false)}
        />
      )}
      {mostrarCliente && <ClienteSelector onSeleccionar={(c) => { setClienteSeleccionado(c); setMostrarCliente(false) }} onCerrar={() => setMostrarCliente(false)} />}
      {mostrarNuevaVenta && <NuevaVentaDialog onCerrar={() => setMostrarNuevaVenta(false)} onVentaCompletada={() => setMostrarNuevaVenta(false)} />}
    </div>
  )
}
