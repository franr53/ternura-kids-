'use client'

import { useState } from 'react'
import { Cliente, MetodoPago } from '@/types'
import { ItemCarrito } from '@/app/(app)/pos/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatPrecio, cn } from '@/lib/utils'
import { X, CheckCircle, Banknote, CreditCard, Smartphone, ArrowLeftRight, HandCoins } from 'lucide-react'

interface Pago {
  metodo: MetodoPago
  monto: number
  notas?: string
}

const EMPRESAS_DEBITO  = ['Fertil', 'Elebar', 'Visa', 'Mastercard', 'Cabal']
const EMPRESAS_CREDITO = ['Visa', 'Mastercard', 'Cabal', 'Naranja']

interface Props {
  carrito: ItemCarrito[]
  total: number
  subtotal: number
  descuentoGlobal: number
  cliente: Cliente | null
  onConfirmar: (pagos: Pago[]) => Promise<void>
  onCerrar: () => void
}

const METODOS: { key: MetodoPago; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'efectivo',      label: 'Efectivo',      icon: <Banknote size={18} />,      color: 'bg-green-100 border-green-400 text-green-700' },
  { key: 'transferencia', label: 'Transferencia',  icon: <Smartphone size={18} />,    color: 'bg-blue-100 border-blue-400 text-blue-700' },
  { key: 'debito',        label: 'Débito',         icon: <CreditCard size={18} />,    color: 'bg-indigo-100 border-indigo-400 text-indigo-700' },
  { key: 'credito',       label: 'Crédito',        icon: <CreditCard size={18} />,    color: 'bg-purple-100 border-purple-400 text-purple-700' },
  { key: 'fiado',         label: 'Fiado',          icon: <HandCoins size={18} />,     color: 'bg-orange-100 border-orange-400 text-orange-700' },
]

export default function PagoDialog({ carrito, total, subtotal, descuentoGlobal, cliente, onConfirmar, onCerrar }: Props) {
  const [pagos, setPagos] = useState<Pago[]>([{ metodo: 'efectivo', monto: total }])
  const [loading, setLoading] = useState(false)

  const totalPagado = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const diferencia = totalPagado - total
  const listo = Math.abs(diferencia) < 1

  function setMetodoPrincipal(metodo: MetodoPago) {
    setPagos([{ metodo, monto: total }])
  }

  const metodoActual = pagos.length === 1 ? pagos[0].metodo : null
  const empresasDisponibles = metodoActual === 'debito' ? EMPRESAS_DEBITO : metodoActual === 'credito' ? EMPRESAS_CREDITO : []
  const empresaActual = pagos.length === 1 ? (pagos[0].notas ?? null) : null

  function seleccionarEmpresa(empresa: string) {
    const nueva = empresa === empresaActual ? undefined : empresa
    setPagos([{ ...pagos[0], notas: nueva }])
  }

  function agregarMetodo(metodo: MetodoPago) {
    if (pagos.some(p => p.metodo === metodo)) return
    setPagos(prev => [...prev, { metodo, monto: 0 }])
  }

  function actualizarMonto(idx: number, monto: number) {
    setPagos(prev => prev.map((p, i) => i === idx ? { ...p, monto } : p))
  }

  function quitarMetodo(idx: number) {
    if (pagos.length === 1) return
    setPagos(prev => prev.filter((_, i) => i !== idx))
  }

  function dividirEnPartes() {
    const mitad = Math.round(total / 2)
    setPagos([
      { metodo: 'efectivo', monto: mitad },
      { metodo: 'transferencia', monto: total - mitad },
    ])
  }

  async function confirmar() {
    if (!listo) return
    if (pagos.some(p => p.metodo === 'fiado') && !cliente) {
      alert('Para registrar fiado necesitás seleccionar un cliente')
      return
    }
    setLoading(true)
    await onConfirmar(pagos)
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Cobrar venta</h2>
            {cliente && <p className="text-sm text-gray-500">Cliente: {cliente.nombre}</p>}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={22} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Total */}
          <div className="text-center bg-teal-50 rounded-xl py-4">
            <p className="text-sm text-gray-500 mb-1">Total a cobrar</p>
            <p className="text-4xl font-bold text-teal-600">{formatPrecio(total)}</p>
          </div>

          {/* Método único */}
          {pagos.length === 1 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Método de pago</p>
              <div className="grid grid-cols-5 gap-2">
                {METODOS.map(m => (
                  <button
                    key={m.key}
                    onClick={() => setMetodoPrincipal(m.key)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all text-xs font-medium',
                      pagos[0].metodo === m.key ? m.color : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {m.icon}
                    <span className="leading-tight text-center">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empresa de débito/crédito */}
          {pagos.length === 1 && empresasDisponibles.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2 font-medium">Empresa</p>
              <div className="flex gap-2 flex-wrap">
                {empresasDisponibles.map(emp => (
                  <button
                    key={emp}
                    onClick={() => seleccionarEmpresa(emp)}
                    className={cn(
                      'text-xs px-3 py-1.5 rounded-full border-2 font-medium transition-all',
                      empresaActual === emp
                        ? 'bg-indigo-100 border-indigo-400 text-indigo-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {emp}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Pago mixto */}
          {pagos.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-medium">Pago mixto</p>
              {pagos.map((pago, idx) => {
                const metodo = METODOS.find(m => m.key === pago.metodo)
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
              {/* Agregar método */}
              <div className="flex gap-1 flex-wrap pt-1">
                {METODOS.filter(m => !pagos.some(p => p.metodo === m.key)).map(m => (
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
            {pagos.length === 1 && (
              <button
                onClick={dividirEnPartes}
                className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-teal-400 hover:text-teal-600 gap-1 flex items-center justify-center"
              >
                <ArrowLeftRight size={12} /> Pago mixto
              </button>
            )}
            {pagos.length === 1 && (
              <button
                onClick={() => setPagos([{ metodo: 'efectivo', monto: total }])}
                className="flex-1 text-xs py-2 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-green-400 hover:text-green-600"
              >
                Monto exacto
              </button>
            )}
          </div>

          {/* Diferencia */}
          {pagos.length > 1 && (
            <div className={cn(
              'text-sm text-center rounded-lg py-2 font-medium',
              diferencia > 0 ? 'bg-green-50 text-green-700' :
              diferencia < 0 ? 'bg-red-50 text-red-600' : 'bg-green-100 text-green-800'
            )}>
              {diferencia > 0 ? `Vuelto: ${formatPrecio(diferencia)}` :
               diferencia < 0 ? `Falta: ${formatPrecio(-diferencia)}` :
               '✓ Monto exacto'}
            </div>
          )}
        </div>

        {/* Confirmar */}
        <div className="p-5 pt-0">
          <Button
            onClick={confirmar}
            disabled={!listo || loading}
            className="w-full bg-teal-500 hover:bg-teal-600 h-12 text-base font-semibold gap-2"
          >
            <CheckCircle size={18} />
            {loading ? 'Registrando...' : 'Confirmar venta'}
          </Button>
        </div>
      </div>
    </div>
  )
}
