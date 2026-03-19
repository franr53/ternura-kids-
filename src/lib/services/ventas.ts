import { SupabaseClient } from '@supabase/supabase-js'
import { Cliente, MetodoPago } from '@/types'
import { formatPrecio } from '@/lib/utils'

export interface ItemVenta {
  varianteId: string
  productoNombre: string
  talle: string
  precio: number
  descuentoItem: number
  cantidad: number
  telefono?: string
}

export interface PagoVenta {
  metodo: MetodoPago
  monto: number
  notas?: string
}

export interface ConfirmarVentaParams {
  supabase: SupabaseClient
  carrito: ItemVenta[]
  pagos: PagoVenta[]
  subtotal: number
  descuento: number
  total: number
  cliente: Cliente | null
  proveedorId?: string
  montoProveedor?: number
}

export interface ResultadoVenta {
  ok: boolean
  ventaId?: string
  error?: string
  comprobante?: string
}

export async function confirmarVenta({
  supabase,
  carrito,
  pagos,
  subtotal,
  descuento,
  total,
  cliente,
  proveedorId,
  montoProveedor,
}: ConfirmarVentaParams): Promise<ResultadoVenta> {

  // Asegurar enteros — los descuentos pueden producir decimales
  const rSubtotal = Math.round(subtotal)
  const rDescuento = Math.round(descuento)
  const rTotal = Math.round(total)

  const items = carrito.map(item => ({
    variante_id: item.varianteId,
    cantidad: item.cantidad,
    precio_unitario: Math.round(item.precio),
    descuento_item: Math.round(item.descuentoItem),
    subtotal: Math.round(item.precio * (1 - item.descuentoItem / 100) * item.cantidad),
  }))

  const pagosRpc = pagos.map(p => ({
    metodo: p.metodo,
    monto: Math.round(p.monto),
    notas: p.notas ?? null,
  }))

  const fechaHoy = new Date().toISOString().split('T')[0]

  const { data, error } = await supabase.rpc('procesar_venta', {
    p_caja_fecha: fechaHoy,
    p_subtotal: rSubtotal,
    p_descuento: rDescuento,
    p_total: rTotal,
    p_items: items,
    p_pagos: pagosRpc,
    p_cliente_id: cliente?.id ?? null,
    p_proveedor_id: proveedorId ?? null,
    p_monto_proveedor: Math.round(montoProveedor ?? 0),
  })

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Error al registrar la venta' }
  }

  const ventaId: string = (data as { venta_id: string }).venta_id

  // Generar comprobante para WhatsApp
  let comprobante: string | undefined
  if (cliente) {
    const lineas = carrito
      .map(i => `  • ${i.productoNombre} T${i.talle} x${i.cantidad} — ${formatPrecio(i.precio * i.cantidad)}`)
      .join('\n')

    const metodosLabel: Record<MetodoPago, string> = {
      efectivo: 'Efectivo', transferencia: 'Transferencia',
      debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
    }
    const metodoTexto = pagos.map(p => metodosLabel[p.metodo]).join(' + ')

    const partes: string[] = [`🛍️ *Ternura Kids* — Comprobante\n`, lineas, '']

    if (rSubtotal !== rTotal && rDescuento > 0) {
      partes.push(`Subtotal: ${formatPrecio(rSubtotal)}`)
      partes.push(`Descuento: -${formatPrecio(rDescuento)}`)
    }
    partes.push(`*Total: ${formatPrecio(rTotal)}*`)
    partes.push(`Pago: ${metodoTexto}`)

    const pagoFiado = pagos.find(p => p.metodo === 'fiado')
    if (pagoFiado) {
      const deudaAnterior = cliente.deuda_total || 0
      const deudaNueva = deudaAnterior + Math.round(pagoFiado.monto)
      partes.push('')
      partes.push(`*Fiado: ${formatPrecio(pagoFiado.monto)}*`)
      partes.push(`Deuda anterior: ${formatPrecio(deudaAnterior)}`)
      partes.push(`*Deuda actual: ${formatPrecio(deudaNueva)}*`)
    }

    const totalPagado = pagos.filter(p => p.metodo !== 'fiado').reduce((s, p) => s + p.monto, 0)
    if (totalPagado > rTotal && cliente.deuda_total > 0) {
      const aplicadoDeuda = totalPagado - rTotal
      const deudaResultante = Math.max(0, (cliente.deuda_total || 0) - aplicadoDeuda)
      partes.push('')
      partes.push(`Total compra: ${formatPrecio(rTotal)}`)
      partes.push(`Pagaste: ${formatPrecio(totalPagado)}`)
      partes.push(`Aplicado a deuda: ${formatPrecio(aplicadoDeuda)}`)
      partes.push(`*Deuda actual: ${formatPrecio(deudaResultante)}*`)
    }

    partes.push('\n¡Gracias por tu compra! 💕')
    comprobante = partes.join('\n')
  }

  return { ok: true, ventaId, comprobante }
}
