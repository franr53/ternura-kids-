'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ItemDevolucion, ResultadoCambio } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { formatPrecio } from '@/lib/utils'
import {
  X, RotateCcw, AlertTriangle, CheckCircle,
  User, Package, ChevronLeft, ChevronRight,
  Banknote, Smartphone, CreditCard, HandCoins,
  Plus, Minus, Search, MessageCircle,
} from 'lucide-react'
import { compartirPDFCambioWhatsApp, type CambioData } from '@/lib/etiquetas-pdf'

// ─── tipos locales ────────────────────────────────────────────────────────────

interface VentaItem {
  variante_id: string
  cantidad: number
  precio_unitario: number
  descuento_item?: number
  variante?: { talle: string; producto?: { nombre_base: string } }
}
interface VentaPago { metodo: string; monto: number }
interface Venta {
  id: string
  total: number
  subtotal: number
  descuento: number
  creado_en: string
  estado: string
  cliente?: { id: string; nombre: string; telefono?: string } | null
  venta_items?: VentaItem[]
  venta_pagos?: VentaPago[]
}
interface ItemSel {
  variante_id: string
  cantidad: number
  cantidad_max: number
  precio_unitario: number
  descuento_item: number
  nombre: string
  seleccionado: boolean
}
interface ItemNuevo {
  variante_id: string
  cantidad: number
  precio_unitario: number
  nombre: string
  talle: string
}
interface ProductoConVariantes {
  producto_id: string
  nombre_base: string
  variantes: { id: string; talle: string; precio_venta: number; stock: number }[]
}
interface VentaHistorial {
  id: string
  total: number
  creado_en: string
  metodo_principal: string
  monto_fiado: number
  items: { nombre: string; talle: string; cantidad: number; precio: number; categoria?: string | null }[]
}
type FiltroHistorial = 'fiado' | 'todas'
interface BalanceProyectado {
  saldoAntes: number; saldoDespues: number
  deudaAntes: number; deudaDespues: number
  saldoCredito: number; deudaRevertida: number
}
interface ClientePanelProps {
  cliente: { id: string; nombre: string; telefono?: string } | null | undefined
  balance: { saldo_favor: number; deuda_total: number } | null
  historial: VentaHistorial[]
  balanceProyectado?: BalanceProyectado | null
  compacto?: boolean
  filtroHistorial: FiltroHistorial
  onFiltroChange: (f: FiltroHistorial) => void
  historialExpandido: boolean
  onToggleExpandido: () => void
}

interface Props { onCerrar: () => void }

// ─── helpers ──────────────────────────────────────────────────────────────────

const METODO_LABEL: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}
const METODO_COLOR: Record<string, string> = {
  efectivo: 'bg-green-100 text-green-700',
  transferencia: 'bg-blue-100 text-blue-700',
  debito: 'bg-amber-100 text-amber-700',
  credito: 'bg-purple-100 text-purple-700',
  fiado: 'bg-red-100 text-red-600',
}
const METODO_ICON: Record<string, React.ReactNode> = {
  efectivo: <Banknote size={11} />,
  transferencia: <Smartphone size={11} />,
  debito: <CreditCard size={11} />,
  credito: <CreditCard size={11} />,
  fiado: <HandCoins size={11} />,
}

function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ─── CalendarPicker ───────────────────────────────────────────────────────────

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
               'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Do','Lu','Ma','Mi','Ju','Vi','Sa']

function CalendarPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date()
  const init = value ? new Date(value + 'T12:00:00') : today
  const [vy, setVy] = useState(init.getFullYear())
  const [vm, setVm] = useState(init.getMonth())

  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T12:00:00')
      setVy(d.getFullYear()); setVm(d.getMonth())
    }
  }, [value])

  const firstDay = new Date(vy, vm, 1).getDay()
  const dim = new Date(vy, vm + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDay).fill(null)
  for (let d = 1; d <= dim; d++) cells.push(d)

  const sel = value ? new Date(value + 'T12:00:00') : null
  const isSel = (d: number) => sel?.getFullYear() === vy && sel?.getMonth() === vm && sel?.getDate() === d
  const isToday = (d: number) => today.getFullYear() === vy && today.getMonth() === vm && today.getDate() === d

  function pick(d: number) {
    onChange(`${vy}-${String(vm+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`)
  }
  function prev() { if (vm===0){setVm(11);setVy(y=>y-1)}else setVm(m=>m-1) }
  function next() { if (vm===11){setVm(0);setVy(y=>y+1)}else setVm(m=>m+1) }

  return (
    <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm bg-white">
      <div className="bg-teal-500 px-3 py-2.5 flex items-center justify-between">
        <button onClick={prev}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors">
          <ChevronLeft size={15} />
        </button>
        <span className="text-white text-sm font-semibold tracking-wide select-none">
          {MESES[vm]} {vy}
        </span>
        <button onClick={next}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors">
          <ChevronRight size={15} />
        </button>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 mb-1">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => d === null ? <div key={i}/> : (
            <button key={i} onClick={() => pick(d)}
              className={`aspect-square rounded-full text-xs font-medium flex items-center justify-center transition-all
                ${isSel(d) ? 'bg-teal-500 text-white shadow-sm ring-2 ring-teal-200 scale-110'
                  : isToday(d) ? 'ring-1 ring-teal-400 text-teal-600 font-bold bg-teal-50'
                  : 'text-gray-700 hover:bg-teal-50 hover:text-teal-600'}`}>
              {d}
            </button>
          ))}
        </div>
        {value && (
          <button onClick={() => onChange('')}
            className="w-full mt-2.5 text-[11px] text-gray-400 hover:text-red-400 transition-colors py-1 border-t border-gray-100">
            Limpiar fecha
          </button>
        )}
      </div>
    </div>
  )
}

// ─── ClientePanel ─────────────────────────────────────────────────────────────

function ClientePanel({
  cliente, balance, historial, balanceProyectado,
  compacto = false, filtroHistorial, onFiltroChange,
  historialExpandido, onToggleExpandido,
}: ClientePanelProps) {
  if (!cliente || !balance) return null

  const historialFiltrado = filtroHistorial === 'fiado'
    ? historial.filter(v => v.metodo_principal === 'fiado')
    : historial
  const historialVisible = historialExpandido ? historialFiltrado : historialFiltrado.slice(0, 3)

  const bp = balanceProyectado

  return (
    <div className="rounded-2xl border border-gray-200 overflow-hidden text-sm">
      {/* header */}
      <div className="bg-gray-50 px-3 py-2.5 flex items-center justify-between border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
            <User size={12} className="text-teal-600" />
          </div>
          <span className="font-semibold text-gray-800 truncate text-xs">{cliente.nombre}</span>
        </div>
        {cliente.telefono && (
          <span className="text-[10px] text-gray-400 shrink-0 ml-2">{cliente.telefono}</span>
        )}
      </div>

      {/* balance */}
      <div className="px-3 py-2.5 space-y-2 border-b border-gray-100">
        {/* saldo a favor */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-gray-500">Saldo a favor</span>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className={balance.saldo_favor > 0 ? 'text-green-600' : 'text-gray-500'}>
              {formatPrecio(balance.saldo_favor)}
            </span>
            {bp && bp.saldoDespues !== bp.saldoAntes && (
              <>
                <span className="text-gray-300">→</span>
                <span className={bp.saldoDespues > bp.saldoAntes ? 'text-green-600' : 'text-gray-600'}>
                  {formatPrecio(bp.saldoDespues)}
                </span>
                {bp.saldoCredito > 0 && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1 py-0.5 rounded-full">
                    +{formatPrecio(bp.saldoCredito)}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {/* deuda */}
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] text-gray-500">Deuda</span>
          <div className="flex items-center gap-1.5 text-xs font-semibold">
            <span className={balance.deuda_total > 0 ? 'text-red-500' : 'text-gray-500'}>
              {formatPrecio(balance.deuda_total)}
            </span>
            {bp && bp.deudaDespues !== bp.deudaAntes && (
              <>
                <span className="text-gray-300">→</span>
                <span className={bp.deudaDespues < bp.deudaAntes ? 'text-green-600' : 'text-red-500'}>
                  {formatPrecio(bp.deudaDespues)}
                </span>
                {bp.deudaRevertida !== 0 && (
                  <span className={`text-[10px] px-1 py-0.5 rounded-full ${bp.deudaRevertida > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                    {bp.deudaRevertida > 0 ? `−${formatPrecio(bp.deudaRevertida)}` : `+${formatPrecio(Math.abs(bp.deudaRevertida))}`}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {bp && bp.saldoCredito > 0 && bp.deudaRevertida > 0 && (
          <p className="text-[10px] text-gray-400">
            Porción ya abonada ({formatPrecio(bp.saldoCredito)}) → saldo a favor.
            Porción fiada ({formatPrecio(bp.deudaRevertida)}) → se revierte.
          </p>
        )}
      </div>

      {/* historial — oculto en modo compacto */}
      {!compacto && (
        <div>
          {/* tabs */}
          <div className="flex border-b border-gray-100">
            {(['fiado', 'todas'] as FiltroHistorial[]).map(f => (
              <button key={f} onClick={() => onFiltroChange(f)}
                className={`flex-1 py-1.5 text-[11px] font-semibold transition-colors ${filtroHistorial === f ? 'text-teal-600 border-b-2 border-teal-500 -mb-px bg-teal-50/40' : 'text-gray-400 hover:text-gray-600'}`}>
                {f === 'fiado' ? 'Fiado' : 'Todas'}
                <span className="ml-1 text-gray-400 font-normal">
                  ({f === 'fiado' ? historial.filter(v => v.metodo_principal === 'fiado').length : historial.length})
                </span>
              </button>
            ))}
          </div>

          {/* lista */}
          <div className="p-2 space-y-1.5">
            {historialFiltrado.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-3">
                {filtroHistorial === 'fiado' ? 'Sin compras en fiado' : 'Sin compras registradas'}
              </p>
            ) : (
              <>
                {historialVisible.map(vh => {
                  const fecha = new Date(vh.creado_en).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
                  const esFiado = vh.metodo_principal === 'fiado'
                  return (
                    <div key={vh.id}
                      className={`rounded-xl border px-2.5 py-2 space-y-1 ${esFiado ? 'bg-amber-50 border-amber-100' : 'bg-gray-50 border-gray-100'}`}>
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-[10px] font-bold ${esFiado ? 'text-amber-700' : 'text-gray-600'}`}>{fecha}</span>
                        <div className="flex items-center gap-1">
                          {esFiado
                            ? <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-medium">
                                <HandCoins size={9} />{formatPrecio(vh.monto_fiado)}
                              </span>
                            : <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${METODO_COLOR[vh.metodo_principal] ?? 'bg-gray-100 text-gray-600'}`}>
                                {METODO_ICON[vh.metodo_principal]}{formatPrecio(vh.total)}
                              </span>
                          }
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        {vh.items.slice(0, 3).map((it, i) => (
                          <div key={i} className="flex items-baseline justify-between gap-1">
                            <span className={`text-[10px] truncate ${esFiado ? 'text-amber-700' : 'text-gray-600'}`}>
                              {it.cantidad > 1 ? `${it.cantidad}× ` : ''}{it.nombre}{it.talle ? ` T${it.talle}` : ''}
                              {it.categoria && (
                                <span className="ml-1 text-[9px] bg-gray-200 text-gray-500 px-1 rounded">{it.categoria}</span>
                              )}
                            </span>
                            <span className={`text-[10px] shrink-0 ${esFiado ? 'text-amber-600' : 'text-gray-500'}`}>
                              {formatPrecio(it.precio * it.cantidad)}
                            </span>
                          </div>
                        ))}
                        {vh.items.length > 3 && (
                          <p className="text-[9px] text-gray-400">+{vh.items.length - 3} item(s) más</p>
                        )}
                      </div>
                    </div>
                  )
                })}

                {historialFiltrado.length > 3 && (
                  <button onClick={onToggleExpandido}
                    className="w-full text-[11px] text-teal-600 hover:text-teal-700 py-1 transition-colors font-medium">
                    {historialExpandido
                      ? 'Mostrar menos'
                      : `Ver todas (${historialFiltrado.length})`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function DevolucionDialog({ onCerrar }: Props) {
  const supabase = createClient()

  const [paso, setPaso] = useState<1 | 2 | '2b' | 3 | 4>(1)
  const [filtroPeriodo, setFiltroPeriodo] = useState<'semana' | 'mes' | 'todo' | 'fecha'>('todo')
  const [filtroFecha, setFiltroFecha] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')

  const [ventas, setVentas] = useState<Venta[]>([])
  const [buscando, setBuscando] = useState(false)
  const [buscadoAlguna, setBuscadoAlguna] = useState(false)

  const [ventaSeleccionada, setVentaSeleccionada] = useState<Venta | null>(null)
  const [items, setItems] = useState<ItemSel[]>([])
  const [loading, setLoading] = useState(false)

  // cambio state
  const [llevaAlgoNuevo, setLlevaAlgoNuevo] = useState(false)
  const [itemsNuevos, setItemsNuevos] = useState<ItemNuevo[]>([])
  const [busquedaNueva, setBusquedaNueva] = useState('')
  const [resultadosNuevos, setResultadosNuevos] = useState<ProductoConVariantes[]>([])
  const [productoExpandido, setProductoExpandido] = useState<string | null>(null)
  const [buscandoNuevo, setBuscandoNuevo] = useState(false)
  const [resolucionDif, setResolucionDif] = useState<string>('')
  const [resultadoCambio, setResultadoCambio] = useState<ResultadoCambio | null>(null)
  const [generandoPDF, setGenerandoPDF] = useState(false)

  // cliente state
  const [clienteBalance, setClienteBalance] = useState<{ saldo_favor: number; deuda_total: number } | null>(null)
  const [clienteHistorial, setClienteHistorial] = useState<VentaHistorial[]>([])
  const [historialExpandido, setHistorialExpandido] = useState(false)
  const [filtroHistorial, setFiltroHistorial] = useState<FiltroHistorial>('fiado')

  // ── live search ventas ────────────────────────────────────────────────────
  useEffect(() => {
    const clienteOk  = filtroCliente.trim().length >= 2
    const productoOk = filtroProducto.trim().length >= 2
    const fechaOk    = filtroPeriodo === 'fecha' ? !!filtroFecha : filtroPeriodo !== 'todo'

    if (!clienteOk && !productoOk && !fechaOk) {
      setVentas([]); setBuscadoAlguna(false); setBuscando(false); return
    }

    setBuscando(true)
    let cancelled = false
    const delay = fechaOk && !clienteOk && !productoOk ? 0 : 350

    const timer = setTimeout(async () => {
      if (cancelled) return

      let clienteIds: string[] | null = null
      if (filtroCliente.trim().length >= 2) {
        const { data } = await supabase.from('clientes').select('id').ilike('nombre', `%${filtroCliente.trim()}%`).limit(50)
        clienteIds = (data || []).map(c => c.id)
        if (clienteIds.length === 0) { if (!cancelled) { setBuscando(false); setVentas([]); setBuscadoAlguna(true) } return }
      }

      let ventaIdsProd: string[] | null = null
      if (filtroProducto.trim().length >= 2) {
        const q = filtroProducto.trim()
        const { data: prods } = await supabase.from('productos').select('id').ilike('nombre_base', `%${q}%`).limit(50)
        const prodIds = (prods || []).map(p => p.id)
        if (prodIds.length > 0) {
          const { data: vars } = await supabase.from('variantes').select('id').limit(100)
            .or(`codigo_barras.eq.${q},producto_id.in.(${prodIds.join(',')})`)
          const varIds = (vars || []).map(v => v.id)
          if (varIds.length === 0) { if (!cancelled) { setBuscando(false); setVentas([]); setBuscadoAlguna(true) } return }
          const { data: vis } = await supabase.from('venta_items').select('venta_id').in('variante_id', varIds).limit(100)
          ventaIdsProd = [...new Set((vis || []).map(vi => vi.venta_id))]
        } else {
          const { data: vars2 } = await supabase.from('variantes').select('id').eq('codigo_barras', q)
          const varIds2 = (vars2 || []).map(v => v.id)
          if (varIds2.length === 0) { if (!cancelled) { setBuscando(false); setVentas([]); setBuscadoAlguna(true) } return }
          const { data: vis2 } = await supabase.from('venta_items').select('venta_id').in('variante_id', varIds2).limit(100)
          ventaIdsProd = [...new Set((vis2 || []).map(vi => vi.venta_id))]
        }
        if (ventaIdsProd.length === 0) { if (!cancelled) { setBuscando(false); setVentas([]); setBuscadoAlguna(true) } return }
      }

      // calcular rango de fechas según período
      const ahora = new Date()
      let desdeStr: string | null = null
      let hastaStr: string | null = null
      if (filtroPeriodo === 'semana') {
        const desde = new Date(ahora); desde.setDate(ahora.getDate() - 7)
        desdeStr = desde.toISOString().slice(0, 10)
      } else if (filtroPeriodo === 'mes') {
        const desde = new Date(ahora); desde.setDate(ahora.getDate() - 30)
        desdeStr = desde.toISOString().slice(0, 10)
      } else if (filtroPeriodo === 'fecha' && filtroFecha) {
        desdeStr = filtroFecha
        hastaStr = filtroFecha + 'T23:59:59'
      }

      let q = supabase.from('ventas')
        .select(`id, total, subtotal, descuento, creado_en, estado,
          cliente:clientes(id, nombre, telefono),
          venta_items(variante_id, cantidad, precio_unitario, descuento_item,
            variante:variantes(talle, producto:productos(nombre_base))),
          venta_pagos(metodo, monto)`)
        .eq('estado', 'completada').order('creado_en', { ascending: false }).limit(50)
      if (desdeStr && hastaStr) q = q.gte('creado_en', desdeStr).lte('creado_en', hastaStr)
      else if (desdeStr)        q = q.gte('creado_en', desdeStr)
      if (clienteIds)           q = q.in('cliente_id', clienteIds)
      if (ventaIdsProd)         q = q.in('id', ventaIdsProd)

      const { data, error } = await q
      if (cancelled) return
      setBuscando(false); setBuscadoAlguna(true)
      if (error) { toast.error('Error al buscar: ' + error.message); return }
      setVentas((data || []) as unknown as Venta[])
    }, delay)

    return () => { cancelled = true; clearTimeout(timer) }
  }, [filtroCliente, filtroProducto, filtroFecha, filtroPeriodo]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── live search productos nuevos ──────────────────────────────────────────
  useEffect(() => {
    if (busquedaNueva.trim().length < 2) { setResultadosNuevos([]); return }
    setBuscandoNuevo(true); setProductoExpandido(null)
    let cancelled = false
    const timer = setTimeout(async () => {
      if (cancelled) return
      const q = busquedaNueva.trim()
      let prodIds: string[] = []

      if (/^[A-Z0-9]{4,}$/i.test(q) && !q.includes(' ')) {
        const { data: varBC } = await supabase.from('variantes').select('producto_id').eq('codigo_barras', q).limit(1)
        if (varBC?.length) prodIds = [varBC[0].producto_id]
      }
      if (prodIds.length === 0) {
        const words = norm(q).split(/\s+/).filter(Boolean)
        // Traer todo el catálogo y filtrar client-side (tolerante a acentos vía norm).
        // El límite debe cubrir el total de productos: con 300 quedaban ~500 invisibles.
        const { data: prods } = await supabase.from('productos').select('id, nombre_base').limit(2000)
        prodIds = (prods || []).filter(p => words.every(w => norm(p.nombre_base).includes(w))).map(p => p.id).slice(0, 15)
      }
      if (prodIds.length === 0) { if (!cancelled) { setResultadosNuevos([]); setBuscandoNuevo(false) } return }

      const { data: vars } = await supabase.from('variantes')
        .select('id, talle, precio_venta, stock, producto_id, producto:productos(id, nombre_base)')
        .in('producto_id', prodIds).limit(100)
      if (cancelled) return

      const map = new Map<string, ProductoConVariantes>()
      ;(vars || []).forEach((v: any) => {
        if (!map.has(v.producto_id)) map.set(v.producto_id, { producto_id: v.producto_id, nombre_base: v.producto?.nombre_base ?? '—', variantes: [] })
        map.get(v.producto_id)!.variantes.push({ id: v.id, talle: v.talle, precio_venta: v.precio_venta, stock: v.stock })
      })
      map.forEach(p => p.variantes.sort((a, b) => a.talle.localeCompare(b.talle, undefined, { numeric: true })))
      setResultadosNuevos([...map.values()])
      setBuscandoNuevo(false)
    }, 350)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [busquedaNueva]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── seleccionar venta ────────────────────────────────────────────────────
  async function seleccionarVenta(v: Venta) {
    setVentaSeleccionada(v)
    setItems((v.venta_items || []).map(vi => ({
      variante_id: vi.variante_id,
      cantidad: vi.cantidad, cantidad_max: vi.cantidad, precio_unitario: vi.precio_unitario,
      descuento_item: vi.descuento_item ?? 0,
      nombre: vi.variante?.producto?.nombre_base ? `${vi.variante.producto.nombre_base} T${vi.variante.talle}` : vi.variante_id,
      seleccionado: false,
    })))
    setLlevaAlgoNuevo(false); setItemsNuevos([]); setBusquedaNueva('')
    setResolucionDif(''); setResultadoCambio(null)
    setClienteBalance(null); setClienteHistorial([])
    setHistorialExpandido(false); setFiltroHistorial('fiado')

    if (v.cliente?.id) {
      const [balanceRes, ventasRes] = await Promise.all([
        supabase.from('clientes').select('saldo_favor, deuda_total').eq('id', v.cliente.id).single(),
        supabase.from('ventas')
          .select(`id, total, creado_en, venta_pagos(metodo, monto),
            venta_items(cantidad, precio_unitario,
              variante:variantes(talle, producto:productos(nombre_base,
                categoria:categorias(nombre))))`)
          .eq('cliente_id', v.cliente.id).eq('estado', 'completada')
          .order('creado_en', { ascending: false }).limit(15),
      ])
      setClienteBalance(balanceRes.data || null)
      const historial: VentaHistorial[] = ((ventasRes.data || []) as any[]).map(ve => {
        const pagos: VentaPago[] = ve.venta_pagos ?? []
        const pagoFiado = pagos.find(p => p.metodo === 'fiado')
        return {
          id: ve.id, total: ve.total, creado_en: ve.creado_en,
          metodo_principal: pagoFiado ? 'fiado' : (pagos[0]?.metodo ?? 'efectivo'),
          monto_fiado: pagoFiado?.monto ?? 0,
          items: (ve.venta_items || []).map((vi: any) => ({
            nombre: vi.variante?.producto?.nombre_base ?? '—',
            talle: vi.variante?.talle ?? '',
            cantidad: vi.cantidad, precio: vi.precio_unitario,
            categoria: vi.variante?.producto?.categoria?.nombre ?? null,
          })),
        }
      })
      setClienteHistorial(historial)
    }
    setPaso(2)
  }

  function toggleItem(idx: number) {
    setItems(p => p.map((it, i) => i === idx ? { ...it, seleccionado: !it.seleccionado } : it))
  }
  function setCantidad(idx: number, val: string) {
    const n = Math.max(1, Math.min(items[idx].cantidad_max, parseInt(val)||1))
    setItems(p => p.map((it, i) => i === idx ? { ...it, cantidad: n } : it))
  }
  function agregarItemNuevo(v: { id: string; talle: string; precio_venta: number }, nombre: string) {
    setItemsNuevos(prev => {
      const exists = prev.findIndex(i => i.variante_id === v.id)
      if (exists >= 0) return prev.map((i, idx) => idx === exists ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { variante_id: v.id, cantidad: 1, precio_unitario: v.precio_venta, nombre, talle: v.talle }]
    })
    setProductoExpandido(null)
  }
  function quitarItemNuevo(idx: number) { setItemsNuevos(p => p.filter((_, i) => i !== idx)) }
  function setCantidadNuevo(idx: number, val: string) {
    const n = Math.max(1, parseInt(val)||1)
    setItemsNuevos(p => p.map((it, i) => i === idx ? { ...it, cantidad: n } : it))
  }

  const itemsSel = items.filter(it => it.seleccionado)
  // Precios "en efectivo": el cambio se valúa en los mismos términos de pago que la compra
  // original. factorVenta = total / subtotal de la venta original (captura el descuento global,
  // ej. 20% efectivo). Se aplica tanto a lo devuelto (lo pagado, con desc. por ítem) como a las
  // prendas nuevas. Venta sin descuento → factor 1 → precio de lista. Espeja el RPC (mig 029/030).
  const factorVenta = ventaSeleccionada && ventaSeleccionada.subtotal > 0
    ? ventaSeleccionada.total / ventaSeleccionada.subtotal
    : 1
  const montoDevItem = (it: ItemSel) =>
    Math.round(it.precio_unitario * (1 - (it.descuento_item ?? 0) / 100) * it.cantidad * factorVenta)
  const montoNuevoItem = (it: ItemNuevo) => Math.round(it.precio_unitario * it.cantidad * factorVenta)
  const totalDev = itemsSel.reduce((s, it) => s + montoDevItem(it), 0)
  const totalNuevo = itemsNuevos.reduce((s, it) => s + montoNuevoItem(it), 0)
  const diferencia = totalDev - totalNuevo
  const descEfectivoPct = Math.round((1 - factorVenta) * 100)
  const metodo   = ventaSeleccionada?.venta_pagos?.[0]?.metodo ?? ''
  const esMixto  = (ventaSeleccionada?.venta_pagos?.length ?? 0) > 1
  const cliente  = ventaSeleccionada?.cliente

  function calcularBalanceProyectado(): BalanceProyectado | null {
    if (!clienteBalance) return null
    const { saldo_favor, deuda_total } = clienteBalance
    let saldoDespues = saldo_favor, deudaDespues = deuda_total
    let saldoCredito = 0, deudaRevertida = 0

    if (llevaAlgoNuevo) {
      if (!resolucionDif && diferencia !== 0) return null
      if (diferencia > 0 && resolucionDif === 'saldo_favor') {
        saldoCredito = diferencia; saldoDespues = saldo_favor + diferencia
      } else if (diferencia < 0 && resolucionDif === 'fiado') {
        deudaRevertida = Math.abs(diferencia)
        deudaDespues = deuda_total + Math.abs(diferencia)
      }
    } else {
      if (metodo === 'fiado') {
        const propPagada = Math.max(0, Math.min(1, 1 - (deuda_total / (ventaSeleccionada?.total || 1))))
        saldoCredito   = Math.round(propPagada * totalDev)
        deudaRevertida = totalDev - saldoCredito
        saldoDespues   = saldo_favor + saldoCredito
        deudaDespues   = Math.max(0, deuda_total - deudaRevertida)
      } else {
        saldoCredito = totalDev; saldoDespues = saldo_favor + totalDev
      }
    }
    return { saldoAntes: saldo_favor, saldoDespues, deudaAntes: deuda_total, deudaDespues, saldoCredito, deudaRevertida }
  }

  const clientePanelProps: Omit<ClientePanelProps, 'balanceProyectado' | 'compacto'> = {
    cliente, balance: clienteBalance, historial: clienteHistorial,
    filtroHistorial, onFiltroChange: setFiltroHistorial,
    historialExpandido, onToggleExpandido: () => setHistorialExpandido(v => !v),
  }

  async function confirmar() {
    if (!ventaSeleccionada || itemsSel.length === 0) return
    setLoading(true)
    const itemsDevRpc: ItemDevolucion[] = itemsSel.map(it => ({ variante_id: it.variante_id, cantidad: it.cantidad, precio_unitario: it.precio_unitario }))

    if (llevaAlgoNuevo && itemsNuevos.length > 0) {
      if (!resolucionDif && diferencia !== 0) { toast.error('Elegí cómo resolver la diferencia'); setLoading(false); return }
      const itemsNuevosRpc: ItemDevolucion[] = itemsNuevos.map(it => ({ variante_id: it.variante_id, cantidad: it.cantidad, precio_unitario: it.precio_unitario }))
      const { data, error } = await supabase.rpc('procesar_cambio', {
        p_venta_original_id: ventaSeleccionada.id,
        p_items_devueltos: itemsDevRpc,
        p_items_nuevos: itemsNuevosRpc,
        p_resolucion: diferencia === 0 ? 'ninguna' : resolucionDif,
      })
      setLoading(false)
      if (error) { toast.error('Error: ' + error.message); return }
      setResultadoCambio(data as ResultadoCambio); setPaso(4)
    } else {
      const { data, error } = await supabase.rpc('procesar_devolucion', { p_venta_id: ventaSeleccionada.id, p_items_devolver: itemsDevRpc })
      setLoading(false)
      if (error) { toast.error('Error: ' + error.message); return }
      const res = data as { saldo_generado: number; deuda_revertida: number; items_procesados: number }
      const partes = [`${res.items_procesados} item(s) devuelto(s)`]
      if (res.saldo_generado > 0) partes.push(`Crédito: ${formatPrecio(res.saldo_generado)}`)
      if (res.deuda_revertida > 0) partes.push(`Deuda revertida: ${formatPrecio(res.deuda_revertida)}`)
      toast.success('Devolución registrada — ' + partes.join(' · '))
      onCerrar()
    }
  }

  async function enviarPDFWhatsApp() {
    if (!ventaSeleccionada || !resultadoCambio) return
    setGenerandoPDF(true)
    try {
      const fecha = new Date(ventaSeleccionada.creado_en).toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' })
      const cambioData: CambioData = {
        fecha, clienteNombre: cliente?.nombre, clienteTelefono: cliente?.telefono ?? '',
        itemsDevueltos: itemsSel.map(it => ({ nombre: it.nombre, talle: it.nombre.match(/T(\w+)$/)?.[1] ?? '', cantidad: it.cantidad, precio: Math.round(montoDevItem(it) / it.cantidad) })),
        itemsNuevos: itemsNuevos.map(it => ({ nombre: it.nombre, talle: it.talle, cantidad: it.cantidad, precio: Math.round(montoNuevoItem(it) / it.cantidad) })),
        totalDevuelto: resultadoCambio.total_devuelto, totalNuevo: resultadoCambio.total_nuevo,
        diferencia: resultadoCambio.diferencia, resolucion: diferencia === 0 ? 'ninguna' : resolucionDif,
      }
      await compartirPDFCambioWhatsApp(cambioData)
    } catch (e) { toast.error('No se pudo generar el PDF'); console.error(e) }
    finally { setGenerandoPDF(false) }
  }

  const pasoLabel = paso === 2 ? 'Paso 1 de 3' : paso === '2b' ? 'Paso 2 de 3' : paso === 3 ? 'Paso 3 de 3' : null

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col"
           style={{ height: 'min(92vh, 780px)' }}>

        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <RotateCcw size={20} className="text-teal-500" />
            <h2 className="text-lg font-bold text-gray-800">
              {paso === 4 ? (llevaAlgoNuevo ? 'Cambio registrado' : 'Devolución registrada') : 'Devolución / Cambio'}
            </h2>
            {pasoLabel && <span className="text-sm text-gray-400">{pasoLabel}</span>}
          </div>
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600 p-1"><X size={22} /></button>
        </div>

        {/* ── paso 1: buscar ───────────────────────────────────────────── */}
        {paso === 1 && (
          <div className="flex flex-1 min-h-0">
            <div className="w-72 shrink-0 border-r border-gray-100 overflow-y-auto p-4 space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Período</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['semana', 'mes', 'todo', 'fecha'] as const).map(p => (
                    <button key={p}
                      onClick={() => { setFiltroPeriodo(p); if (p !== 'fecha') setFiltroFecha('') }}
                      className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                        filtroPeriodo === p ? 'bg-teal-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-teal-50 hover:text-teal-700'
                      }`}>
                      {p === 'semana' ? 'Esta semana' : p === 'mes' ? 'Este mes' : p === 'todo' ? 'Todo' : 'Fecha exacta'}
                    </button>
                  ))}
                </div>
                {filtroPeriodo === 'fecha' && (
                  <div className="mt-3">
                    <CalendarPicker value={filtroFecha} onChange={setFiltroFecha} />
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <User size={12} /> Cliente
                </label>
                <Input placeholder="Nombre del cliente..." value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="h-9 text-sm rounded-xl" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-2">
                  <Package size={12} /> Producto o código
                </label>
                <Input placeholder="Nombre o código de barras..." value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} className="h-9 text-sm rounded-xl" />
              </div>
              {buscando && <p className="text-xs text-teal-500 text-center animate-pulse">Buscando...</p>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {!buscadoAlguna && !buscando && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
                  <RotateCcw size={40} strokeWidth={1.2} className="text-gray-300" />
                  <p className="text-sm">Usá los filtros para encontrar la venta</p>
                </div>
              )}
              {buscadoAlguna && !buscando && ventas.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <p className="text-sm">No se encontraron ventas con esos filtros</p>
                </div>
              )}
              {ventas.map(v => {
                const fecha = new Date(v.creado_en)
                const pagos = v.venta_pagos ?? []
                const vitems = v.venta_items ?? []
                return (
                  <button key={v.id} onClick={() => seleccionarVenta(v)}
                    className="w-full text-left border border-gray-200 rounded-2xl overflow-hidden hover:border-teal-300 hover:shadow-md transition-all group">
                    <div className="px-4 py-3 bg-gray-50 group-hover:bg-teal-50/60 transition-colors flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                          <User size={14} className="text-teal-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-800 truncate">{v.cliente?.nombre ?? 'Sin cliente'}</p>
                          <p className="text-xs text-gray-400">
                            {fecha.toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' })}
                            {' · '}{fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-gray-800">{formatPrecio(v.total)}</p>
                        {v.descuento > 0 && <p className="text-xs text-gray-400">Desc. {formatPrecio(v.descuento)}</p>}
                        <div className="flex gap-1 justify-end mt-1 flex-wrap">
                          {pagos.map((p, i) => (
                            <span key={i} className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${METODO_COLOR[p.metodo] ?? 'bg-gray-100 text-gray-600'}`}>
                              {METODO_ICON[p.metodo]}{METODO_LABEL[p.metodo]} {formatPrecio(p.monto)}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="px-4 py-2 divide-y divide-gray-50">
                      {vitems.map((vi, i) => (
                        <div key={i} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] bg-gray-100 text-gray-500 rounded-md px-1.5 py-0.5 font-semibold shrink-0">T{vi.variante?.talle ?? '?'}</span>
                            <span className="text-sm text-gray-700 truncate">{vi.variante?.producto?.nombre_base ?? '—'}</span>
                            {vi.cantidad > 1 && <span className="text-xs text-gray-400 shrink-0">×{vi.cantidad}</span>}
                          </div>
                          <span className="text-sm font-medium text-gray-600 shrink-0">{formatPrecio(vi.precio_unitario * vi.cantidad)}</span>
                        </div>
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── paso 2: items a devolver ─────────────────────────────────── */}
        {paso === 2 && ventaSeleccionada && (
          <div className="flex flex-1 min-h-0">
            {/* columna items */}
            <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${cliente ? 'border-r border-gray-100' : ''}`}>
              {esMixto ? (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700">Esta venta tiene pago mixto. Las devoluciones de pago mixto no están disponibles en esta versión.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500">Tocá cada prenda para marcarla como devuelta:</p>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="flex items-center gap-1 bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">↩ Devuelve</span>
                      <span className="flex items-center gap-1 bg-green-100 text-green-600 px-2 py-0.5 rounded-full font-medium">✓ Queda</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {items.map((it, idx) => (
                      <div key={it.variante_id} onClick={() => toggleItem(idx)}
                        className={`border-2 rounded-2xl px-4 py-3 cursor-pointer transition-all ${
                          it.seleccionado
                            ? 'border-red-300 bg-red-50 shadow-sm'
                            : 'border-green-200 bg-green-50/40 hover:border-green-300'
                        }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                            it.seleccionado ? 'border-red-500 bg-red-500' : 'border-green-400 bg-green-400'
                          }`}>
                            {it.seleccionado
                              ? <X size={10} className="text-white" />
                              : <CheckCircle size={12} className="text-white" />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{it.nombre}</p>
                              <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                it.seleccionado ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'
                              }`}>
                                {it.seleccionado ? '↩ Devuelve' : '✓ Queda'}
                              </span>
                            </div>
                            <p className="text-xs text-gray-400">{formatPrecio(it.precio_unitario)} c/u · cant. original: {it.cantidad_max}</p>
                          </div>
                          {it.seleccionado ? (
                            <div onClick={e => e.stopPropagation()}>
                              <Input type="number" min={1} max={it.cantidad_max} value={it.cantidad} onChange={e => setCantidad(idx, e.target.value)} className="w-16 text-center h-8 text-sm" />
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">×{it.cantidad_max}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* resumen montos — siempre visible */}
                  <div className="rounded-2xl border border-gray-200 overflow-hidden">
                    <div className="grid grid-cols-3 divide-x divide-gray-200">
                      <div className="px-3 py-2.5 text-center">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-0.5">Total compra</p>
                        <p className="text-sm font-bold text-gray-700">{formatPrecio(ventaSeleccionada.total)}</p>
                      </div>
                      <div className="px-3 py-2.5 text-center bg-red-50">
                        <p className="text-[10px] text-red-400 uppercase tracking-wide font-semibold mb-0.5">Se devuelve</p>
                        <p className={`text-sm font-bold ${totalDev > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                          {totalDev > 0 ? formatPrecio(totalDev) : '—'}
                        </p>
                      </div>
                      <div className="px-3 py-2.5 text-center bg-green-50">
                        <p className="text-[10px] text-green-500 uppercase tracking-wide font-semibold mb-0.5">Queda</p>
                        <p className={`text-sm font-bold ${ventaSeleccionada.total - totalDev > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                          {ventaSeleccionada.total - totalDev > 0 ? formatPrecio(ventaSeleccionada.total - totalDev) : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                  {itemsSel.length > 0 && (
                    <button onClick={() => setLlevaAlgoNuevo(v => !v)}
                      className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${llevaAlgoNuevo ? 'border-teal-400 bg-teal-50' : 'border-dashed border-gray-300 hover:border-teal-300 hover:bg-teal-50/40'}`}>
                      <span className="text-sm font-medium text-gray-700">¿La clienta lleva algo nuevo?</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${llevaAlgoNuevo ? 'border-teal-500 bg-teal-500' : 'border-gray-300'}`}>
                        {llevaAlgoNuevo && <CheckCircle size={12} className="text-white" />}
                      </div>
                    </button>
                  )}
                </>
              )}
            </div>

            {/* columna cliente */}
            {cliente && (
              <div className="w-72 shrink-0 overflow-y-auto p-4 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Cuenta del cliente</p>
                <ClientePanel {...clientePanelProps} compacto={false} />
                {/* resumen de esta devolución en el panel del cliente */}
                <div className="rounded-2xl border border-gray-200 overflow-hidden text-xs">
                  <div className="bg-gray-50 px-3 py-2 border-b border-gray-100">
                    <p className="font-semibold text-gray-500 uppercase tracking-wide text-[10px]">Esta devolución</p>
                  </div>
                  <div className="divide-y divide-gray-100">
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-gray-500">Total compra</span>
                      <span className="font-semibold text-gray-700">{formatPrecio(ventaSeleccionada.total)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-red-50">
                      <span className="text-red-500">↩ Devuelve</span>
                      <span className={`font-bold ${totalDev > 0 ? 'text-red-600' : 'text-gray-300'}`}>
                        {totalDev > 0 ? formatPrecio(totalDev) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-green-50">
                      <span className="text-green-600">✓ Queda</span>
                      <span className={`font-bold ${ventaSeleccionada.total - totalDev > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                        {ventaSeleccionada.total - totalDev > 0 ? formatPrecio(ventaSeleccionada.total - totalDev) : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── paso 2b: prendas nuevas ───────────────────────────────────── */}
        {paso === '2b' && (
          <div className="flex flex-1 min-h-0 gap-0">
            {/* panel buscador */}
            <div className="flex-1 flex flex-col min-h-0 border-r border-gray-100">
              <div className="p-4 pb-2 border-b border-gray-100">
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <Input placeholder="Buscar por nombre o código de barras..." value={busquedaNueva} onChange={e => setBusquedaNueva(e.target.value)} className="h-9 text-sm rounded-xl pl-9" autoFocus />
                </div>
                {buscandoNuevo && <p className="text-xs text-teal-500 animate-pulse mt-1.5">Buscando...</p>}
              </div>
              <div className="flex-1 overflow-y-auto">
                {!busquedaNueva.trim() && (
                  <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-2">
                    <Search size={32} strokeWidth={1.2} />
                    <p className="text-sm text-gray-400">Escribí para buscar una prenda</p>
                  </div>
                )}
                {busquedaNueva.trim() && !buscandoNuevo && resultadosNuevos.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-6">Sin resultados</p>
                )}
                {resultadosNuevos.length > 0 && (
                  <div className="divide-y divide-gray-50">
                    {resultadosNuevos.map(grupo => {
                      const expandido = productoExpandido === grupo.producto_id
                      const stockTotal = grupo.variantes.reduce((s, v) => s + v.stock, 0)
                      return (
                        <div key={grupo.producto_id}>
                          <button onClick={() => setProductoExpandido(prev => prev === grupo.producto_id ? null : grupo.producto_id)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-teal-50/60 transition-colors text-left">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-gray-800 truncate">{grupo.nombre_base}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                {stockTotal <= 0 ? <span className="text-xs text-orange-500 font-medium">⚠ Sin stock</span>
                                  : <span className="text-xs text-gray-400">Stock total: {stockTotal}</span>}
                                <span className="text-xs text-gray-400">{grupo.variantes.length} {grupo.variantes.length === 1 ? 'talle' : 'talles'}</span>
                              </div>
                            </div>
                            <ChevronRight size={15} className={`text-gray-400 transition-transform shrink-0 ml-2 ${expandido ? 'rotate-90' : ''}`} />
                          </button>
                          {expandido && (
                            <div className="px-4 pb-3 bg-gray-50 flex flex-wrap gap-2">
                              {grupo.variantes.map(v => (
                                <button key={v.id} onClick={() => agregarItemNuevo(v, grupo.nombre_base)}
                                  className="flex flex-col items-center gap-0.5 px-3 py-2 bg-white border border-gray-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition-all min-w-[60px]">
                                  <span className="text-sm font-bold text-gray-800">{v.talle}</span>
                                  <span className="text-xs text-teal-600 font-medium">{formatPrecio(v.precio_venta)}</span>
                                  {v.stock <= 0 ? <span className="text-[10px] text-orange-500">sin stock</span>
                                    : <span className="text-[10px] text-gray-400">×{v.stock}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* panel derecho: carrito + cliente compacto */}
            <div className="w-72 shrink-0 flex flex-col min-h-0">
              {/* carrito */}
              <div className="flex flex-col min-h-0" style={{ maxHeight: cliente ? '55%' : '100%' }}>
                <div className="px-4 py-3 border-b border-gray-100 shrink-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Se lleva</p>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {itemsNuevos.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-300 gap-1">
                      <Package size={28} strokeWidth={1.2} />
                      <p className="text-xs text-gray-400 text-center">Elegí talles del buscador</p>
                    </div>
                  ) : (
                    itemsNuevos.map((it, idx) => (
                      <div key={it.variante_id} className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-800 truncate">{it.nombre}</p>
                            <p className="text-xs text-teal-600 font-bold">T{it.talle} · {formatPrecio(it.precio_unitario)}</p>
                          </div>
                          <button onClick={() => quitarItemNuevo(idx)} className="text-gray-300 hover:text-red-400 transition-colors shrink-0 mt-0.5">
                            <X size={14} />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => setCantidadNuevo(idx, String(Math.max(1, it.cantidad - 1)))}
                            className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:border-teal-400 transition-colors">
                            <Minus size={10} className="text-gray-500" />
                          </button>
                          <span className="text-sm font-bold text-gray-700 w-4 text-center">{it.cantidad}</span>
                          <button onClick={() => setCantidadNuevo(idx, String(it.cantidad + 1))}
                            className="w-6 h-6 rounded-full bg-white border border-gray-200 flex items-center justify-center hover:border-teal-400 transition-colors">
                            <Plus size={10} className="text-gray-500" />
                          </button>
                          <span className="text-xs text-gray-500 ml-auto">{formatPrecio(it.precio_unitario * it.cantidad)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                {itemsNuevos.length > 0 && (
                  <div className="px-4 py-3 border-t border-gray-100 shrink-0">
                    <div className="flex justify-between text-sm font-bold text-gray-800">
                      <span>Total</span><span className="text-teal-600">{formatPrecio(totalNuevo)}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* cliente compacto */}
              {cliente && clienteBalance && (
                <div className="border-t border-gray-200 overflow-y-auto p-3 flex-1">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Cuenta</p>
                  <ClientePanel {...clientePanelProps} compacto={true} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── paso 3: resumen y resolución ─────────────────────────────── */}
        {paso === 3 && ventaSeleccionada && (
          <div className="flex flex-1 min-h-0">
            {/* columna principal */}
            <div className={`flex-1 overflow-y-auto p-6 space-y-4 ${cliente ? 'border-r border-gray-100' : ''}`}>
              {llevaAlgoNuevo ? (
                <>
                  {/* resumen cambio */}
                  <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Resumen del cambio</p>
                    {descEfectivoPct > 0 && <p className="text-[11px] text-teal-600 -mt-1 mb-1">Precios en efectivo (−{descEfectivoPct}%)</p>}
                    <div className="space-y-1">
                      {itemsSel.map(it => (
                        <div key={it.variante_id} className="flex justify-between text-sm text-gray-600">
                          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-400 inline-block shrink-0"/>{it.nombre} ×{it.cantidad}</span>
                          <span className="text-red-500">−{formatPrecio(montoDevItem(it))}</span>
                        </div>
                      ))}
                    </div>
                    {itemsNuevos.length > 0 && (
                      <div className="space-y-1 pt-2 border-t border-gray-200">
                        {itemsNuevos.map(it => (
                          <div key={it.variante_id} className="flex justify-between text-sm text-gray-600">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block shrink-0"/>{it.nombre} T{it.talle} ×{it.cantidad}</span>
                            <span className="text-teal-600">+{formatPrecio(montoNuevoItem(it))}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="pt-2 border-t border-gray-200 flex justify-between text-sm font-bold text-gray-800">
                      <span>Diferencia</span>
                      <span className={diferencia > 0 ? 'text-green-600' : diferencia < 0 ? 'text-red-500' : 'text-gray-500'}>
                        {diferencia > 0 ? `+${formatPrecio(diferencia)}` : diferencia < 0 ? `−${formatPrecio(Math.abs(diferencia))}` : 'Cambio exacto'}
                      </span>
                    </div>
                  </div>

                  {/* resolución */}
                  {diferencia === 0 ? (
                    <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
                      <CheckCircle size={16} className="text-teal-500 shrink-0" />
                      <p className="text-sm text-teal-700 font-medium">Cambio exacto — sin diferencia</p>
                    </div>
                  ) : diferencia > 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">El cliente tiene un crédito de <strong className="text-green-600">{formatPrecio(diferencia)}</strong>. ¿Cómo se resuelve?</p>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { val: 'saldo_favor', label: 'Dejar como saldo a favor', desc: cliente?.nombre ?? 'cliente', icon: '💳' },
                          { val: 'efectivo', label: 'Devolver en efectivo', desc: 'se descuenta de caja', icon: '💵' },
                        ].map(opt => (
                          <button key={opt.val} onClick={() => setResolucionDif(opt.val)}
                            className={`flex flex-col items-start gap-1 p-3 rounded-2xl border-2 transition-all ${resolucionDif === opt.val ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
                            <span className="text-lg">{opt.icon}</span>
                            <span className="text-sm font-semibold text-gray-800">{opt.label}</span>
                            <span className="text-xs text-gray-500">{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm text-gray-600">El cliente debe abonar <strong className="text-red-500">{formatPrecio(Math.abs(diferencia))}</strong>. ¿Cómo paga?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { val: 'efectivo', label: 'Efectivo', icon: <Banknote size={18} /> },
                          { val: 'transferencia', label: 'Transferencia', icon: <Smartphone size={18} /> },
                          { val: 'fiado', label: 'Fiado', icon: <HandCoins size={18} />, disabled: !cliente },
                        ].map(opt => (
                          <button key={opt.val} onClick={() => !opt.disabled && setResolucionDif(opt.val)} disabled={opt.disabled}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all ${opt.disabled ? 'opacity-40 cursor-not-allowed border-gray-100' : resolucionDif === opt.val ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
                            <span className={resolucionDif === opt.val ? 'text-teal-600' : 'text-gray-500'}>{opt.icon}</span>
                            <span className="text-sm font-medium text-gray-700">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                      {!cliente && <p className="text-xs text-gray-400">Fiado no disponible sin cliente asignado</p>}
                    </div>
                  )}
                  <p className="text-xs text-red-500 font-medium">Esta acción no se puede deshacer.</p>
                </>
              ) : (
                /* devolución pura */
                <>
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Prendas a devolver</p>
                    {descEfectivoPct > 0 && <p className="text-[11px] text-teal-600 mb-2">Precio en efectivo (−{descEfectivoPct}%)</p>}
                    {itemsSel.map(it => (
                      <div key={it.variante_id} className="flex justify-between text-sm text-gray-600 py-1 border-b border-gray-50">
                        <span>{it.nombre} ×{it.cantidad}</span>
                        <span>{formatPrecio(montoDevItem(it))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold text-gray-800 pt-1">
                      <span>Total devuelto</span><span className="text-teal-600">{formatPrecio(totalDev)}</span>
                    </div>
                  </div>
                  {!cliente && (
                    <div className="flex items-start gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                      <Package size={16} className="text-gray-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-gray-600">Sin cliente asignado — solo se actualiza el stock.
                        <span className="block text-xs text-gray-400 mt-0.5">{itemsSel.length} {itemsSel.length === 1 ? 'item vuelve' : 'items vuelven'} al inventario.</span>
                      </p>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <Package size={13} />
                    <span>{itemsSel.length} {itemsSel.length === 1 ? 'item vuelve' : 'items vuelven'} al inventario.</span>
                  </div>
                  <p className="text-xs text-red-400 font-medium">Esta acción no se puede deshacer.</p>
                </>
              )}
            </div>

            {/* columna cliente */}
            {cliente && (
              <div className="w-72 shrink-0 overflow-y-auto p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Cuenta del cliente</p>
                <ClientePanel {...clientePanelProps} balanceProyectado={calcularBalanceProyectado()} compacto={false} />
              </div>
            )}
          </div>
        )}

        {/* ── paso 4: éxito ─────────────────────────────────────────────── */}
        {paso === 4 && resultadoCambio && (
          <div className="flex-1 flex flex-col items-center justify-center p-6 gap-5">
            <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center">
              <CheckCircle size={32} className="text-teal-500" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-lg font-bold text-gray-800">Cambio registrado</p>
              <p className="text-sm text-gray-500">El stock fue actualizado correctamente</p>
            </div>
            <div className="bg-gray-50 rounded-2xl p-4 w-full max-w-sm space-y-2">
              <div className="flex justify-between text-sm text-gray-600"><span>Total devuelto</span><span>{formatPrecio(resultadoCambio.total_devuelto)}</span></div>
              {resultadoCambio.total_nuevo > 0 && (
                <div className="flex justify-between text-sm text-gray-600"><span>Total llevado</span><span>{formatPrecio(resultadoCambio.total_nuevo)}</span></div>
              )}
              {resultadoCambio.diferencia !== 0 && (
                <div className="flex justify-between text-sm font-semibold pt-1 border-t border-gray-200">
                  <span>Diferencia</span>
                  <span className={resultadoCambio.diferencia > 0 ? 'text-green-600' : 'text-red-500'}>
                    {resultadoCambio.diferencia > 0 ? `+${formatPrecio(resultadoCambio.diferencia)}` : `−${formatPrecio(Math.abs(resultadoCambio.diferencia))}`}
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3 w-full max-w-sm">
              {cliente?.telefono && (
                <Button onClick={enviarPDFWhatsApp} disabled={generandoPDF} className="flex-1 bg-green-500 hover:bg-green-600 text-white gap-2">
                  <MessageCircle size={16} />
                  {generandoPDF ? 'Generando...' : 'WhatsApp'}
                </Button>
              )}
              <Button variant="outline" onClick={onCerrar} className="flex-1">Cerrar</Button>
            </div>
          </div>
        )}

        {/* footer */}
        {paso !== 4 && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            {paso === 1 && <Button variant="outline" onClick={onCerrar} className="flex-1">Cancelar</Button>}
            {paso === 2 && (
              <>
                <Button variant="outline" onClick={() => setPaso(1)} className="flex-1">Atrás</Button>
                {esMixto
                  ? <Button variant="outline" onClick={onCerrar} className="flex-1">Cerrar</Button>
                  : <Button onClick={() => llevaAlgoNuevo ? setPaso('2b') : setPaso(3)} disabled={itemsSel.length === 0}
                      className="flex-1 bg-teal-500 hover:bg-teal-600 text-white">
                      {llevaAlgoNuevo ? 'Elegir prendas nuevas →' : 'Continuar'}
                    </Button>
                }
              </>
            )}
            {paso === '2b' && (
              <>
                <Button variant="outline" onClick={() => setPaso(2)} className="flex-1">Atrás</Button>
                <Button onClick={() => setPaso(3)} disabled={itemsNuevos.length === 0} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white">Ver resumen →</Button>
              </>
            )}
            {paso === 3 && (
              <>
                <Button variant="outline" onClick={() => setPaso(llevaAlgoNuevo ? '2b' : 2)} className="flex-1">Atrás</Button>
                <Button onClick={confirmar} disabled={loading || (llevaAlgoNuevo && diferencia !== 0 && !resolucionDif)}
                  className={`flex-1 text-white ${llevaAlgoNuevo ? 'bg-teal-500 hover:bg-teal-600' : 'bg-red-500 hover:bg-red-600'}`}>
                  {loading ? 'Procesando...' : llevaAlgoNuevo ? 'Confirmar cambio' : 'Confirmar devolución'}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
