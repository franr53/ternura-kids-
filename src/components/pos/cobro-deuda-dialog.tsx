'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Banco, Cliente, Proveedor } from '@/types'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { X, Search, Banknote, Smartphone, CreditCard, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react'
import { formatPrecio, cn } from '@/lib/utils'

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function fuzzyMatch(texto: string, query: string): boolean {
  const t = normalizar(texto)
  return normalizar(query).split(/\s+/).filter(Boolean).every(w => t.includes(w))
}

interface Props {
  onCerrar: () => void
  onCobroCompletado?: () => void
}

export default function CobroDeudaDialog({ onCerrar, onCobroCompletado }: Props) {
  const supabase = createClient()

  // Paso 1: selección de cliente
  const [todosClientes, setTodosClientes] = useState<Cliente[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)

  // Paso 2: cobro
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState<'efectivo' | 'transferencia' | 'debito'>('efectivo')
  const [notas, setNotas] = useState('')
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [proveedorTransferencia, setProveedorTransferencia] = useState<Proveedor | null>(null)
  const [bancos, setBancos] = useState<Banco[]>([])
  const [bancoTransferencia, setBancoTransferencia] = useState<Banco | null>(null)
  const [agregandoBanco, setAgregandoBanco] = useState(false)
  const [nombreBancoNuevo, setNombreBancoNuevo] = useState('')
  const [guardandoBanco, setGuardandoBanco] = useState(false)
  const [procesando, setProcesando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  useEffect(() => {
    async function cargar() {
      const [{ data: clientes }, { data: provs }, { data: bcs }] = await Promise.all([
        supabase.from('clientes').select('id, nombre, telefono, deuda_total, activo, creado_en, direccion').eq('activo', true).order('nombre'),
        supabase.from('marcas').select('id, nombre, deuda_total, alias_cbu, activo, creado_en, notas, telefono, email, direccion').eq('activo', true).order('nombre'),
        supabase.from('bancos').select('id, nombre, activo, creado_en').eq('activo', true).order('nombre'),
      ])
      setTodosClientes((clientes || []) as Cliente[])
      setProveedores((provs || []) as Proveedor[])
      setBancos((bcs || []) as Banco[])
    }
    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clientesFiltrados = busqueda.trim()
    ? todosClientes.filter(c => fuzzyMatch(c.nombre, busqueda) && c.deuda_total > 0)
    : todosClientes.filter(c => c.deuda_total > 0).slice(0, 8)

  async function confirmarCobro() {
    if (!clienteSeleccionado) return
    const montoNum = parseFloat(monto)
    if (!montoNum || montoNum <= 0) { toast.error('Ingresá un monto válido'); return }
    if (montoNum > clienteSeleccionado.deuda_total) {
      toast.error(`El monto supera la deuda (${formatPrecio(clienteSeleccionado.deuda_total)})`)
      return
    }

    // Destinos solo aplican con transferencia, y son mutuamente excluyentes
    const proveedorDestino = metodo === 'transferencia' ? proveedorTransferencia : null
    const bancoDestino = metodo === 'transferencia' && !proveedorDestino ? bancoTransferencia : null

    setProcesando(true)
    const { error } = await supabase.rpc('procesar_cobro_deuda', {
      p_cliente_id: clienteSeleccionado.id,
      p_monto: Math.round(montoNum),
      p_metodo: metodo,
      p_notas: notas || null,
      p_proveedor_id: proveedorDestino?.id || null,
      p_banco_id: bancoDestino?.id || null,
    })
    setProcesando(false)

    if (error) { toast.error('Error: ' + error.message); return }

    toast.success(`Cobro de ${formatPrecio(montoNum)} registrado para ${clienteSeleccionado.nombre}`)
    onCobroCompletado?.()
    onCerrar()
  }

  async function agregarBanco() {
    const nombre = nombreBancoNuevo.trim()
    if (!nombre) { toast.error('Ingresá el nombre del banco'); return }
    setGuardandoBanco(true)
    const { data, error } = await supabase.from('bancos').insert({ nombre }).select('id, nombre, activo, creado_en').single()
    setGuardandoBanco(false)
    if (error || !data) { toast.error('Error al agregar banco: ' + (error?.message || '')); return }
    const nuevo = data as Banco
    setBancos(prev => [...prev, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)))
    setBancoTransferencia(nuevo)
    setProveedorTransferencia(null)
    setNombreBancoNuevo('')
    setAgregandoBanco(false)
    toast.success(`Banco "${nuevo.nombre}" agregado`)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3 shrink-0">
          {clienteSeleccionado && (
            <button
              onClick={() => { setClienteSeleccionado(null); setMonto(''); setNotas(''); setProveedorTransferencia(null); setBancoTransferencia(null); setAgregandoBanco(false); setNombreBancoNuevo(''); setConfirmando(false) }}
              className="text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <div className="flex-1">
            <h2 className="font-bold text-gray-800">Cobrar deuda</h2>
            {clienteSeleccionado && (
              <p className="text-xs text-gray-400">{clienteSeleccionado.nombre} · Debe {formatPrecio(clienteSeleccionado.deuda_total)}</p>
            )}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Paso 1: buscar cliente */}
          {!clienteSeleccionado ? (
            <div className="p-4 space-y-3">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input
                  autoFocus
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar cliente con deuda..."
                  className="pl-9"
                />
              </div>
              {clientesFiltrados.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-6">
                  {busqueda ? 'No hay clientes con ese nombre y deuda pendiente' : 'No hay clientes con deuda pendiente'}
                </p>
              ) : (
                <div className="space-y-1">
                  {clientesFiltrados.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setClienteSeleccionado(c)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-teal-50 border border-transparent hover:border-teal-100 transition-all text-left"
                    >
                      <div>
                        <p className="font-semibold text-gray-800 text-sm">{c.nombre}</p>
                        {c.telefono && <p className="text-xs text-gray-400">{c.telefono}</p>}
                      </div>
                      <span className="text-sm font-bold text-red-500 shrink-0">{formatPrecio(c.deuda_total)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : !confirmando ? (
            /* Paso 2: ingresar cobro */
            <div className="p-4 space-y-4">
              <div className="text-center py-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-2xl font-bold text-red-500">{formatPrecio(clienteSeleccionado.deuda_total)}</p>
                <p className="text-xs text-gray-400 mt-0.5">deuda actual</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Monto a cobrar</label>
                <Input
                  autoFocus
                  type="number"
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  placeholder="0"
                  className="mt-1 text-lg font-semibold"
                />
                {monto && parseFloat(monto) > 0 && parseFloat(monto) <= clienteSeleccionado.deuda_total && (
                  <p className="text-xs text-gray-500 mt-1">
                    Saldo resultante:{' '}
                    <span className={cn('font-semibold', (clienteSeleccionado.deuda_total - parseFloat(monto)) === 0 ? 'text-green-600' : 'text-red-500')}>
                      {formatPrecio(Math.max(0, clienteSeleccionado.deuda_total - parseFloat(monto)))}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Método de pago</label>
                <div className="flex gap-1.5 mt-1">
                  {([
                    { key: 'efectivo', label: 'Efectivo', icon: <Banknote size={13} /> },
                    { key: 'transferencia', label: 'Transfer.', icon: <Smartphone size={13} /> },
                    { key: 'debito', label: 'Débito', icon: <CreditCard size={13} /> },
                  ] as const).map(m => (
                    <button
                      key={m.key}
                      onClick={() => { setMetodo(m.key); if (m.key !== 'transferencia') { setProveedorTransferencia(null); setBancoTransferencia(null) } }}
                      className={cn(
                        'flex-1 flex items-center justify-center gap-1 py-2 rounded-xl border text-xs font-medium transition-colors',
                        metodo === m.key
                          ? 'bg-green-100 border-green-400 text-green-700'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      )}
                    >
                      {m.icon} {m.label}
                    </button>
                  ))}
                </div>
              </div>
              {metodo === 'transferencia' && !bancoTransferencia && proveedores.length > 0 && (
                <div>
                  {proveedorTransferencia ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200">
                      <Smartphone size={13} className="text-blue-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-blue-700 truncate">{proveedorTransferencia.nombre}</p>
                        <p className="text-xs text-blue-600 font-mono truncate">
                          {proveedorTransferencia.alias_cbu || <span className="italic text-blue-400">sin alias/CBU</span>}
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
                        if (prov) { setProveedorTransferencia(prov); setBancoTransferencia(null) }
                      }}
                      className="w-full h-9 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-blue-400"
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
              {metodo === 'transferencia' && !proveedorTransferencia && (
                <div>
                  {bancoTransferencia ? (
                    <div className="flex items-center gap-2 p-2.5 rounded-lg bg-teal-50 border border-teal-200">
                      <Banknote size={13} className="text-teal-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-teal-700 truncate">{bancoTransferencia.nombre}</p>
                        <p className="text-xs text-teal-500">Transferencia registrada en esta cuenta</p>
                      </div>
                      <button onClick={() => setBancoTransferencia(null)} className="text-teal-300 hover:text-teal-600 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ) : agregandoBanco ? (
                    <div className="flex gap-1.5">
                      <Input
                        value={nombreBancoNuevo}
                        onChange={e => setNombreBancoNuevo(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregarBanco() } }}
                        placeholder="Nombre del banco / cuenta"
                        autoFocus
                        className="flex-1 h-9 text-xs"
                      />
                      <Button onClick={agregarBanco} disabled={guardandoBanco} className="h-9 px-3 bg-teal-500 hover:bg-teal-600 text-xs">
                        {guardandoBanco ? <Loader2 size={13} className="animate-spin" /> : 'Agregar'}
                      </Button>
                      <button onClick={() => { setAgregandoBanco(false); setNombreBancoNuevo('') }} className="text-gray-300 hover:text-gray-600 shrink-0">
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <select
                      value=""
                      onChange={e => {
                        if (e.target.value === '__add__') { setAgregandoBanco(true); return }
                        const b = bancos.find(x => x.id === e.target.value)
                        if (b) { setBancoTransferencia(b); setProveedorTransferencia(null) }
                      }}
                      className="w-full h-9 rounded-xl border border-teal-200 bg-teal-50 text-teal-700 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-teal-400"
                    >
                      <option value="">🏦 ¿A qué banco te transfirió?</option>
                      {bancos.map(b => (
                        <option key={b.id} value={b.id}>{b.nombre}</option>
                      ))}
                      <option value="__add__">+ Agregar banco…</option>
                    </select>
                  )}
                </div>
              )}
              <Input
                value={notas}
                onChange={e => setNotas(e.target.value)}
                placeholder="Nota (opcional)"
                className="text-sm"
              />
              <Button
                onClick={() => {
                  const montoNum = parseFloat(monto)
                  if (!montoNum || montoNum <= 0) { toast.error('Ingresá un monto válido'); return }
                  if (montoNum > clienteSeleccionado.deuda_total) {
                    toast.error(`El monto supera la deuda (${formatPrecio(clienteSeleccionado.deuda_total)})`); return
                  }
                  setConfirmando(true)
                }}
                disabled={!monto || parseFloat(monto) <= 0}
                className="w-full bg-green-500 hover:bg-green-600 gap-2 h-11"
              >
                <CheckCircle size={16} /> Confirmar cobro
              </Button>
            </div>
          ) : (
            /* Paso 3: confirmación */
            <div className="p-4 space-y-4">
              <div className="rounded-xl bg-green-50 border border-green-200 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Cliente</span>
                  <span className="font-medium">{clienteSeleccionado.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Monto</span>
                  <span className="font-bold text-green-700 text-base">{formatPrecio(parseFloat(monto))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Método</span>
                  <span className="font-medium capitalize">{metodo}</span>
                </div>
                {metodo === 'transferencia' && (proveedorTransferencia || bancoTransferencia) && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Destino</span>
                    <span className="font-medium">{proveedorTransferencia?.nombre || bancoTransferencia?.nombre}</span>
                  </div>
                )}
                {notas && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Nota</span>
                    <span className="font-medium">{notas}</span>
                  </div>
                )}
                <div className="border-t pt-2 flex justify-between">
                  <span className="text-gray-500">Deuda resultante</span>
                  <span className="font-medium text-orange-600">{formatPrecio(Math.max(0, clienteSeleccionado.deuda_total - parseFloat(monto)))}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setConfirmando(false)}>
                  Volver
                </Button>
                <Button
                  className="flex-1 bg-green-500 hover:bg-green-600 gap-2"
                  disabled={procesando}
                  onClick={confirmarCobro}
                >
                  <CheckCircle size={15} />
                  {procesando ? 'Procesando...' : 'Cobrar'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
