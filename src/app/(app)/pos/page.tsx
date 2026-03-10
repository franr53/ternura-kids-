'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Variante, Producto, Cliente, MetodoPago } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import {
  Search, Trash2, Plus, Minus, ShoppingCart, X,
  Barcode, User, Percent, MessageCircle, CreditCard,
  Banknote, Smartphone, ArrowLeftRight, HandCoins
} from 'lucide-react'
import { formatPrecio, cn } from '@/lib/utils'
import BuscadorProducto from '@/components/pos/buscador-producto'
import PagoDialog from '@/components/pos/pago-dialog'
import ClienteSelector from '@/components/pos/cliente-selector'

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
  const [inputCodigo, setInputCodigo] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Foco automático para el lector de barras
  useEffect(() => {
    inputRef.current?.focus()
  }, [carrito])

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
        precio: variante.producto?.precio_venta || 0,
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

  // Cálculos
  const subtotalItems = carrito.reduce((sum, item) => {
    const precioConDesc = item.precio * (1 - item.descuentoItem / 100)
    return sum + precioConDesc * item.cantidad
  }, 0)
  const montoDescGlobal = subtotalItems * (descuentoGlobal / 100)
  const total = subtotalItems - montoDescGlobal

  function abrirWhatsApp(comprobante: string) {
    if (!clienteSeleccionado?.telefono) return
    const telefono = clienteSeleccionado.telefono.replace(/\D/g, '')
    const url = `https://wa.me/54${telefono}?text=${encodeURIComponent(comprobante)}`
    window.open(url, '_blank')
  }

  return (
    <div className="h-full flex gap-0 overflow-hidden">
      {/* Panel izquierdo — Buscador / Productos */}
      <div className="flex-1 flex flex-col p-4 overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <h1 className="text-xl font-bold text-gray-800 mr-2">Punto de Venta</h1>
          <Badge variant="outline" className="gap-1">
            <ShoppingCart size={12} /> {carrito.length} items
          </Badge>
        </div>

        {/* Input código de barras */}
        <div className="relative mb-3">
          <Barcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            ref={inputRef}
            placeholder="Escanear código de barras o buscar producto..."
            value={inputCodigo}
            onChange={e => setInputCodigo(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') agregarPorCodigo(inputCodigo)
            }}
            className="pl-9 pr-10"
          />
          <button
            onClick={() => setMostrarBuscador(true)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-500"
          >
            <Search size={16} />
          </button>
        </div>

        <Button
          variant="outline"
          className="w-full mb-4 gap-2 text-gray-600"
          onClick={() => setMostrarBuscador(true)}
        >
          <Search size={16} /> Buscar producto por nombre
        </Button>

        {/* Lista carrito (mobile-friendly) */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-300">
              <ShoppingCart size={64} />
              <p className="mt-3 text-sm">El carrito está vacío</p>
              <p className="text-xs">Escaneá un código o buscá un producto</p>
            </div>
          ) : (
            carrito.map((item, idx) => (
              <div key={idx} className="bg-white rounded-lg border border-gray-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{item.productoNombre}</p>
                    <p className="text-xs text-gray-500">Talle {item.talle}</p>
                  </div>
                  <button onClick={() => eliminarItem(idx)} className="text-gray-300 hover:text-red-400 shrink-0">
                    <X size={16} />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2">
                  {/* Cantidad */}
                  <div className="flex items-center gap-2">
                    <button onClick={() => cambiarCantidad(idx, -1)} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-pink-400">
                      <Minus size={12} />
                    </button>
                    <span className="w-6 text-center font-medium text-sm">{item.cantidad}</span>
                    <button onClick={() => cambiarCantidad(idx, 1)} className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center hover:border-pink-400">
                      <Plus size={12} />
                    </button>
                  </div>
                  {/* Descuento item */}
                  <div className="flex items-center gap-1">
                    <Percent size={12} className="text-gray-400" />
                    <input
                      type="number"
                      value={item.descuentoItem || ''}
                      onChange={e => setDescuentoItem(idx, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className="w-12 text-center text-xs border border-gray-200 rounded px-1 py-0.5"
                      min={0} max={100}
                    />
                  </div>
                  {/* Precio */}
                  <div className="text-right">
                    <p className="font-semibold text-gray-800 text-sm">
                      {formatPrecio(item.precio * (1 - item.descuentoItem / 100) * item.cantidad)}
                    </p>
                    {item.descuentoItem > 0 && (
                      <p className="text-xs text-gray-400 line-through">{formatPrecio(item.precio * item.cantidad)}</p>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panel derecho — Resumen y cobro */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          <h2 className="font-semibold text-gray-700">Resumen</h2>

          {/* Cliente */}
          <div>
            <button
              onClick={() => setMostrarCliente(true)}
              className="w-full flex items-center gap-2 p-2.5 rounded-lg border border-dashed border-gray-300 hover:border-pink-400 hover:bg-pink-50 transition-colors text-sm"
            >
              <User size={16} className="text-gray-400" />
              {clienteSeleccionado ? (
                <span className="text-gray-700 font-medium">{clienteSeleccionado.nombre}</span>
              ) : (
                <span className="text-gray-400">Agregar cliente (opcional)</span>
              )}
            </button>
            {clienteSeleccionado && (
              <button
                onClick={() => setClienteSeleccionado(null)}
                className="text-xs text-gray-400 hover:text-red-400 mt-1 ml-1"
              >
                Quitar cliente
              </button>
            )}
          </div>

          {/* Descuento global */}
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Descuento general (%)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={descuentoGlobal || ''}
                onChange={e => setDescuentoGlobal(Math.min(parseFloat(e.target.value) || 0, 100))}
                placeholder="0"
                className="h-8 text-sm"
                min={0} max={100}
              />
              {[5, 10, 15, 20].map(d => (
                <button
                  key={d}
                  onClick={() => setDescuentoGlobal(d)}
                  className={cn(
                    'text-xs px-2 py-1 rounded border transition-colors',
                    descuentoGlobal === d
                      ? 'bg-pink-100 border-pink-400 text-pink-700'
                      : 'border-gray-200 text-gray-500 hover:border-pink-300'
                  )}
                >
                  {d}%
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Totales */}
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatPrecio(subtotalItems)}</span>
            </div>
            {descuentoGlobal > 0 && (
              <div className="flex justify-between text-green-600">
                <span>Descuento {descuentoGlobal}%</span>
                <span>- {formatPrecio(montoDescGlobal)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-gray-800 pt-1">
              <span>Total</span>
              <span className="text-pink-600">{formatPrecio(total)}</span>
            </div>
          </div>
        </div>

        {/* Botones cobro */}
        <div className="p-4 border-t border-gray-100 space-y-2">
          <Button
            onClick={() => setMostrarPago(true)}
            disabled={carrito.length === 0}
            className="w-full bg-pink-500 hover:bg-pink-600 text-white font-semibold h-12 text-base gap-2"
          >
            <CreditCard size={18} /> Cobrar {carrito.length > 0 && formatPrecio(total)}
          </Button>
          <Button
            variant="outline"
            onClick={limpiarCarrito}
            disabled={carrito.length === 0}
            className="w-full text-gray-500 gap-2"
          >
            <Trash2 size={16} /> Limpiar
          </Button>
        </div>
      </div>

      {/* Dialogs */}
      {mostrarBuscador && (
        <BuscadorProducto
          onSeleccionar={agregarAlCarrito}
          onCerrar={() => setMostrarBuscador(false)}
        />
      )}
      {mostrarPago && (
        <PagoDialog
          carrito={carrito}
          total={total}
          descuentoGlobal={descuentoGlobal}
          subtotal={subtotalItems}
          cliente={clienteSeleccionado}
          onConfirmar={async (pagos) => {
            // Registrar venta
            const { data: caja } = await supabase
              .from('cajas')
              .select('id')
              .eq('estado', 'abierta')
              .eq('fecha', new Date().toISOString().split('T')[0])
              .single()

            const { data: venta, error } = await supabase.from('ventas').insert({
              caja_id: caja?.id || null,
              cliente_id: clienteSeleccionado?.id || null,
              descuento: montoDescGlobal,
              subtotal: subtotalItems,
              total,
              estado: 'completada',
            }).select().single()

            if (error || !venta) { toast.error('Error al registrar la venta'); return }

            // Items
            await supabase.from('venta_items').insert(
              carrito.map(item => ({
                venta_id: venta.id,
                variante_id: item.varianteId,
                cantidad: item.cantidad,
                precio_unitario: item.precio,
                descuento_item: item.descuentoItem,
                subtotal: item.precio * (1 - item.descuentoItem / 100) * item.cantidad,
              }))
            )

            // Pagos
            await supabase.from('venta_pagos').insert(
              pagos.map(p => ({ venta_id: venta.id, metodo: p.metodo, monto: p.monto }))
            )

            // Actualizar stock
            for (const item of carrito) {
              const { data: v } = await supabase.from('variantes').select('stock').eq('id', item.varianteId).single()
              if (v) {
                await supabase.from('variantes').update({ stock: v.stock - item.cantidad }).eq('id', item.varianteId)
              }
            }

            // Fiado
            const pagoFiado = pagos.find(p => p.metodo === 'fiado')
            if (pagoFiado && clienteSeleccionado) {
              await supabase.from('fiado_movimientos').insert({
                cliente_id: clienteSeleccionado.id,
                venta_id: venta.id,
                tipo: 'cargo',
                monto: pagoFiado.monto,
              })
              await supabase.from('clientes').update({
                deuda_total: (clienteSeleccionado.deuda_total || 0) + pagoFiado.monto
              }).eq('id', clienteSeleccionado.id)
            }

            // Actualizar caja
            if (caja?.id) {
              const updates: Record<string, number> = {}
              for (const p of pagos) {
                const campo = `total_${p.metodo}`
                const { data: cajaActual } = await supabase.from('cajas').select(campo).eq('id', caja.id).single()
                if (cajaActual) updates[campo] = ((cajaActual as unknown as Record<string, number>)[campo] || 0) + p.monto
              }
              if (Object.keys(updates).length) await supabase.from('cajas').update(updates).eq('id', caja.id)
            }

            toast.success(`Venta registrada — ${formatPrecio(total)}`)
            setMostrarPago(false)

            // WhatsApp si hay cliente con teléfono
            const tieneWhatsApp = clienteSeleccionado?.telefono
            if (tieneWhatsApp) {
              const lineas = carrito.map(i =>
                `  • ${i.productoNombre} T${i.talle} x${i.cantidad} — ${formatPrecio(i.precio * i.cantidad)}`
              ).join('\n')
              const comprobante = `🛍️ *Ternura Kids* — Comprobante\n\n${lineas}\n\nTotal: *${formatPrecio(total)}*\n¡Gracias por tu compra! 💕`
              abrirWhatsApp(comprobante)
            }

            limpiarCarrito()
          }}
          onCerrar={() => setMostrarPago(false)}
        />
      )}
      {mostrarCliente && (
        <ClienteSelector
          onSeleccionar={(c) => { setClienteSeleccionado(c); setMostrarCliente(false) }}
          onCerrar={() => setMostrarCliente(false)}
        />
      )}
    </div>
  )
}
