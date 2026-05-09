'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MetodoPago } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatPrecio, cn } from '@/lib/utils'
import {
  X, CheckCircle, Banknote, Smartphone, CreditCard, HandCoins,
  ArrowLeftRight, AlertTriangle, ArrowRight,
} from 'lucide-react'

interface PagoEditar {
  metodo: MetodoPago
  monto: number
  notas?: string
}

export interface VentaEditable {
  id: string
  subtotal: number
  total: number
  descuento: number
  cliente_id?: string
  caja_id?: string
  creado_en: string
  pagos: PagoEditar[]
  caja?: { estado: string }
  venta_items?: { cantidad: number; variante?: { talle: string; producto?: { nombre_base: string } } }[]
}

interface Props {
  venta: VentaEditable | null
  open: boolean
  onClose: () => void
  onSaved: () => void
}

const METODOS_CON_DESCUENTO: MetodoPago[] = ['efectivo', 'transferencia']

const METODOS_UI = [
  { key: 'efectivo' as MetodoPago,      label: 'Efectivo',      icon: <Banknote size={18} />,   color: 'bg-green-100 border-green-400 text-green-700' },
  { key: 'transferencia' as MetodoPago, label: 'Transfer.',     icon: <Smartphone size={18} />, color: 'bg-blue-100 border-blue-400 text-blue-700' },
  { key: 'debito' as MetodoPago,        label: 'Débito',        icon: <CreditCard size={18} />, color: 'bg-indigo-100 border-indigo-400 text-indigo-700' },
  { key: 'credito' as MetodoPago,       label: 'Crédito',       icon: <CreditCard size={18} />, color: 'bg-purple-100 border-purple-400 text-purple-700' },
  { key: 'fiado' as MetodoPago,         label: 'Fiado',         icon: <HandCoins size={18} />,  color: 'bg-orange-100 border-orange-400 text-orange-700' },
]

export default function EditarPagoDialog({ venta, open, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [pagos, setPagos] = useState<PagoEditar[]>([])
  const [loading, setLoading] = useState(false)
  const [confirmarCajaCerrada, setConfirmarCajaCerrada] = useState(false)

  useEffect(() => {
    if (venta) {
      setPagos(venta.pagos.map(p => ({ ...p })))
      setConfirmarCajaCerrada(false)
    }
  }, [venta?.id])

  if (!open || !venta) return null

  const esMixto = pagos.length > 1
  const tieneDescuento = pagos.length > 0 && pagos.every(p => METODOS_CON_DESCUENTO.includes(p.metodo))
  const nuevoDescuento = tieneDescuento ? Math.round(venta.subtotal * 0.20) : 0
  const nuevoTotal = venta.subtotal - nuevoDescuento
  const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const diferenciaPago = totalPagado - nuevoTotal
  const listo = Math.abs(diferenciaPago) < 1
  const cajaCerrada = venta.caja?.estado === 'cerrada'

  const fechaStr = new Date(venta.creado_en).toLocaleDateString('es-AR', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const resumenItems = venta.venta_items && venta.venta_items.length > 0
    ? venta.venta_items.slice(0, 2).map(it => it.variante?.producto?.nombre_base || '—').join(', ')
      + (venta.venta_items.length > 2 ? ` +${venta.venta_items.length - 2}` : '')
    : null

  function setMetodoPrincipal(metodo: MetodoPago) {
    const desc = METODOS_CON_DESCUENTO.includes(metodo) ? Math.round(venta!.subtotal * 0.20) : 0
    const total = venta!.subtotal - desc
    setPagos([{ metodo, monto: total }])
  }

  function activarMixto() {
    const mitad = Math.round(nuevoTotal / 2)
    setPagos([
      { metodo: 'efectivo', monto: mitad },
      { metodo: 'transferencia', monto: nuevoTotal - mitad },
    ])
  }

  function agregarMetodo(metodo: MetodoPago) {
    if (pagos.some(p => p.metodo === metodo)) return
    setPagos(prev => [...prev, { metodo, monto: 0 }])
  }

  function actualizarMonto(idx: number, monto: number) {
    setPagos(prev => prev.map((p, i) => i === idx ? { ...p, monto: Math.round(monto) } : p))
  }

  function quitarMetodo(idx: number) {
    if (pagos.length === 1) return
    setPagos(prev => prev.filter((_, i) => i !== idx))
  }

  async function guardar() {
    if (!listo) return
    if (pagos.some(p => p.metodo === 'fiado') && !venta!.cliente_id) {
      toast.error('Esta venta no tiene cliente — no se puede registrar fiado')
      return
    }
    if (cajaCerrada && !confirmarCajaCerrada) {
      setConfirmarCajaCerrada(true)
      return
    }

    setLoading(true)
    const { error } = await supabase.rpc('editar_pagos_venta', {
      p_venta_id: venta!.id,
      p_nuevos_pagos: pagos.map(p => ({ ...p, monto: Math.round(p.monto) })),
      p_nuevo_total: Math.round(nuevoTotal),
      p_nuevo_descuento: Math.round(nuevoDescuento),
    })
    setLoading(false)

    if (error) {
      toast.error('Error al guardar: ' + error.message)
      setConfirmarCajaCerrada(false)
      return
    }

    toast.success('Pago actualizado')
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Editar pago</h2>
            <p className="text-sm text-gray-500">
              {fechaStr}{resumenItems ? ` · ${resumenItems}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Aviso caja cerrada */}
          {cajaCerrada && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Caja cerrada</p>
                <p className="text-xs mt-0.5 text-amber-700">
                  Esta venta es de un día anterior. Al confirmar se ajustarán los totales de esa caja.
                </p>
              </div>
            </div>
          )}

          {/* Resumen de montos */}
          <div className="bg-gray-50 rounded-xl p-3 space-y-1 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Subtotal</span>
              <span>{formatPrecio(venta.subtotal)}</span>
            </div>
            <div className={cn('flex justify-between', tieneDescuento ? 'text-green-700 font-medium' : 'text-gray-400')}>
              <span>Descuento efectivo/transfer. (20%)</span>
              <span>{tieneDescuento ? `−${formatPrecio(nuevoDescuento)}` : '−$0'}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-800 border-t border-gray-200 pt-1.5 mt-1">
              <span>Nuevo total</span>
              <span className="text-teal-600 text-base">{formatPrecio(nuevoTotal)}</span>
            </div>
          </div>

          {/* Diferencia antes/después */}
          {nuevoTotal !== venta.total && (
            <div className="flex items-center gap-2 text-sm">
              <div className="flex-1 text-center p-2.5 bg-red-50 rounded-xl">
                <p className="text-xs text-gray-400 mb-0.5">Antes</p>
                <p className="font-bold text-red-500">{formatPrecio(venta.total)}</p>
              </div>
              <ArrowRight size={16} className="text-gray-300 shrink-0" />
              <div className="flex-1 text-center p-2.5 bg-green-50 rounded-xl">
                <p className="text-xs text-gray-400 mb-0.5">Después</p>
                <p className="font-bold text-green-600">{formatPrecio(nuevoTotal)}</p>
              </div>
            </div>
          )}

          {/* Selector método único */}
          {!esMixto && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Método de pago</p>
              <div className="grid grid-cols-5 gap-1.5">
                {METODOS_UI.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPrincipal(m.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all text-xs font-medium',
                      pagos[0]?.metodo === m.key ? m.color : 'border-gray-200 text-gray-400 hover:border-gray-300'
                    )}
                  >
                    {m.icon}
                    <span className="leading-tight text-center">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pago mixto */}
          {esMixto && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Pago mixto</p>
              {pagos.map((pago, idx) => {
                const metodo = METODOS_UI.find(m => m.key === pago.metodo)
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <div className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium w-36 shrink-0', metodo?.color)}>
                      {metodo?.icon} {metodo?.label}
                    </div>
                    <Input
                      type="number"
                      value={pago.monto || ''}
                      onChange={e => actualizarMonto(idx, parseFloat(e.target.value) || 0)}
                      className="flex-1 h-9"
                      min={0}
                    />
                    <button onClick={() => quitarMetodo(idx)} className="text-gray-300 hover:text-red-400">
                      <X size={16} />
                    </button>
                  </div>
                )
              })}
              <div className="flex gap-1 flex-wrap pt-1">
                {METODOS_UI.filter(m => !pagos.some(p => p.metodo === m.key)).map(m => (
                  <button
                    key={m.key}
                    onClick={() => agregarMetodo(m.key)}
                    className="text-xs px-2 py-1 rounded border border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600"
                  >
                    + {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Botones rápidos */}
          <div className="flex gap-2">
            {!esMixto ? (
              <button
                onClick={activarMixto}
                className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600 flex items-center justify-center gap-1"
              >
                <ArrowLeftRight size={12} /> Pago mixto
              </button>
            ) : (
              <button
                onClick={() => setMetodoPrincipal(pagos[0]?.metodo ?? 'efectivo')}
                className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-gray-400"
              >
                Volver a pago único
              </button>
            )}
          </div>

          {/* Estado de diferencia (mixto) */}
          {esMixto && (
            <div className={cn(
              'text-sm text-center rounded-lg py-2 font-medium',
              diferenciaPago > 1  ? 'bg-green-50 text-green-700' :
              diferenciaPago < -1 ? 'bg-red-50 text-red-600'    : 'bg-green-100 text-green-800'
            )}>
              {diferenciaPago > 1  ? `Sobra: ${formatPrecio(diferenciaPago)}`   :
               diferenciaPago < -1 ? `Falta: ${formatPrecio(-diferenciaPago)}`  :
               '✓ Monto exacto'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 pt-0 space-y-2">
          {confirmarCajaCerrada ? (
            <>
              <p className="text-xs text-amber-700 text-center font-medium mb-2">
                ¿Confirmar edición en caja cerrada?
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmarCajaCerrada(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={guardar}
                  disabled={loading}
                  className="flex-1 bg-amber-500 hover:bg-amber-600 gap-2"
                >
                  <CheckCircle size={16} />
                  {loading ? 'Guardando...' : 'Sí, editar igual'}
                </Button>
              </div>
            </>
          ) : (
            <Button
              onClick={guardar}
              disabled={!listo || loading}
              className="w-full bg-teal-500 hover:bg-teal-600 h-12 text-base font-semibold gap-2"
            >
              <CheckCircle size={18} />
              {loading ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
