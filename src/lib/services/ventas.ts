import { SupabaseClient } from '@supabase/supabase-js'
import { Cliente, MetodoPago } from '@/types'

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
}

export interface ConfirmarVentaParams {
  supabase: SupabaseClient
  carrito: ItemVenta[]
  pagos: PagoVenta[]
  subtotal: number
  descuento: number
  total: number
  cliente: Cliente | null
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
}: ConfirmarVentaParams): Promise<ResultadoVenta> {

  // 1. Obtener caja abierta del día
  const { data: caja } = await supabase
    .from('cajas')
    .select('id, total_efectivo, total_transferencia, total_debito, total_credito, total_fiado')
    .eq('estado', 'abierta')
    .eq('fecha', new Date().toISOString().split('T')[0])
    .single()

  // 2. Crear la venta
  const { data: venta, error } = await supabase
    .from('ventas')
    .insert({
      caja_id: caja?.id || null,
      cliente_id: cliente?.id || null,
      descuento,
      subtotal,
      total,
      estado: 'completada',
    })
    .select('id')
    .single()

  if (error || !venta) {
    return { ok: false, error: 'Error al registrar la venta' }
  }

  // 3. Insertar items y pagos en paralelo
  await Promise.all([
    supabase.from('venta_items').insert(
      carrito.map(item => ({
        venta_id: venta.id,
        variante_id: item.varianteId,
        cantidad: item.cantidad,
        precio_unitario: item.precio,
        descuento_item: item.descuentoItem,
        subtotal: item.precio * (1 - item.descuentoItem / 100) * item.cantidad,
      }))
    ),
    supabase.from('venta_pagos').insert(
      pagos.map(p => ({ venta_id: venta.id, metodo: p.metodo, monto: p.monto }))
    ),
  ])

  // 4. Actualizar stock de forma atómica (sin race condition)
  await Promise.all(
    carrito.map(item =>
      supabase.rpc('decrementar_stock', {
        p_variante_id: item.varianteId,
        p_cantidad: item.cantidad,
      })
    )
  )

  // 5. Registrar fiado si corresponde
  const pagoFiado = pagos.find(p => p.metodo === 'fiado')
  if (pagoFiado && cliente) {
    await Promise.all([
      supabase.from('fiado_movimientos').insert({
        cliente_id: cliente.id,
        venta_id: venta.id,
        tipo: 'cargo',
        monto: pagoFiado.monto,
      }),
      supabase.from('clientes').update({
        deuda_total: (cliente.deuda_total || 0) + pagoFiado.monto,
      }).eq('id', cliente.id),
    ])
  }

  // 6. Actualizar caja con todos los métodos de pago en una sola operación
  if (caja?.id) {
    const updates: Record<string, number> = {}
    for (const p of pagos) {
      const campo = `total_${p.metodo}` as keyof typeof caja
      updates[campo] = ((caja[campo] as number) || 0) + p.monto
    }
    if (Object.keys(updates).length) {
      await supabase.from('cajas').update(updates).eq('id', caja.id)
    }
  }

  // 7. Generar comprobante para WhatsApp
  let comprobante: string | undefined
  if (cliente?.telefono) {
    const lineas = carrito
      .map(i => `  • ${i.productoNombre} T${i.talle} x${i.cantidad} — $${(i.precio * i.cantidad).toLocaleString('es-AR')}`)
      .join('\n')
    comprobante = `🛍️ *Ternura Kids* — Comprobante\n\n${lineas}\n\nTotal: *$${total.toLocaleString('es-AR')}*\n¡Gracias por tu compra! 💕`
  }

  return { ok: true, ventaId: venta.id, comprobante }
}
