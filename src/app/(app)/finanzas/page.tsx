'use client'

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Skeleton } from '@/components/ui/skeleton'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  TrendingUp, TrendingDown, ArrowDown, ArrowUp, AlertTriangle,
} from 'lucide-react'
import { formatPrecio } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'
import { motion } from 'framer-motion'

// ── Tipos que devuelven los RPC (migración 033_finanzas_rpc.sql) ──────────
interface Resumen {
  entro_contado: number; entro_cobros: number; entro_total: number
  salio_mercaderia: number; salio_local: number; salio_personal: number
  salio_otros: number; salio_total: number; quedo: number
  facturado: number; costo_vendido: number; fiado_nuevo: number
  por_metodo: { metodo: string; monto: number }[]
}
interface MesEvo {
  mes: string
  entro_contado: number; entro_cobros: number
  salio_mercaderia: number; salio_local: number; salio_personal: number
  facturado: number; costo_vendido: number; fiado_nuevo: number
}
interface Rubro { nombre: string; grupo: string; monto: number; monto_anterior: number }
interface TramoDeuda { tramo: string; orden: number; monto: number; clientes: number }

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia',
  debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
}
const C = {
  verde: '#10B981', azul: '#93C5FD', violeta: '#A78BFA',
  rosa: '#F9A8D4', ambar: '#FCD34D', gris: '#9ca3af', rojo: '#F43F5E',
}
const GRUPO_COLOR: Record<string, string> = {
  'Mercadería': C.azul, 'Local': C.verde, 'Personal': C.violeta, 'Otros': C.gris,
}

function mesLabel(off: number): string {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() - off, 1)
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
}
function rangoMes(off: number): { ini: string; fin: string } {
  const base = new Date()
  const ini = new Date(base.getFullYear(), base.getMonth() - off, 1)
  const fin = new Date(base.getFullYear(), base.getMonth() - off + 1, 0)
  const p = (n: number) => String(n).padStart(2, '0')
  return {
    ini: `${ini.getFullYear()}-${p(ini.getMonth() + 1)}-01`,
    fin: `${fin.getFullYear()}-${p(fin.getMonth() + 1)}-${p(fin.getDate())}`,
  }
}
const kFmt = (v: number) => `$${Math.round(v / 1000)}k`
const mesCorto = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')

function Card({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`bg-white rounded-2xl p-5 ${className}`}
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      {children}
    </motion.div>
  )
}
function Titulo({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{children}</h2>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}
/** Fila con etiqueta, monto y barra proporcional. */
function Fila({ label, monto, max, color, hint, mask }: {
  label: string; monto: number; max: number; color: string; hint?: string
  mask: (s: string) => string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs text-gray-600 font-medium truncate">{label}</span>
        </div>
        <span className="text-xs font-bold text-gray-700 shrink-0">{mask(formatPrecio(monto))}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${max > 0 ? (monto / max) * 100 : 0}%`, backgroundColor: color }} />
      </div>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  )
}

export default function FinanzasPage() {
  const supabase = createClient()
  const { mask } = usePrivacyMode()
  const [mes, setMes] = useState(0)

  const { ini, fin } = rangoMes(mes)

  const { data: resumen, loading: loadResumen } = useCache<Resumen>(`fin:res:${mes}`, async () => {
    const { data } = await supabase.rpc('finanzas_resumen_mes', { p_inicio: ini, p_fin: fin })
    return data as Resumen
  })
  const { data: evo } = useCache<MesEvo[]>('fin:evo:12', async () => {
    const { data } = await supabase.rpc('finanzas_evolucion', { p_meses: 12 })
    return (data ?? []) as MesEvo[]
  })
  const { data: rubros } = useCache<Rubro[]>(`fin:rub:${mes}`, async () => {
    const { data } = await supabase.rpc('finanzas_gastos_rubro', { p_inicio: ini, p_fin: fin })
    return (data ?? []) as Rubro[]
  })
  const { data: deuda } = useCache<TramoDeuda[]>('fin:deuda', async () => {
    const { data } = await supabase.rpc('finanzas_deuda_antiguedad')
    return (data ?? []) as TramoDeuda[]
  })

  // ── Derivados ──────────────────────────────────────────────────────────
  const r = resumen
  const entro = r?.entro_total ?? 0
  const salio = r?.salio_total ?? 0
  const quedo = r?.quedo ?? 0
  const maxCaja = Math.max(entro, salio, 1)
  const maxEntro = Math.max(r?.entro_contado ?? 0, r?.entro_cobros ?? 0, 1)
  const maxSalio = Math.max(r?.salio_mercaderia ?? 0, r?.salio_local ?? 0, r?.salio_personal ?? 0, r?.salio_otros ?? 0, 1)
  // Resultado del local = sin los gastos personales de la familia
  const resultadoLocal = quedo + (r?.salio_personal ?? 0)

  const rubrosList = rubros ?? []
  const totalRubros = rubrosList.reduce((s, x) => s + Number(x.monto), 0)
  const maxRubro = Math.max(...rubrosList.map(x => Number(x.monto)), 1)
  const facturado = r?.facturado ?? 0

  const evoData = useMemo(() => (evo ?? []).map(m => ({
    mes: mesCorto(m.mes),
    Mercadería: Number(m.salio_mercaderia),
    Local: Number(m.salio_local),
    Personal: Number(m.salio_personal),
    Comprado: Number(m.salio_mercaderia),
    'Vendido a costo': Number(m.costo_vendido),
    Fiado: Number(m.fiado_nuevo),
    Cobrado: Number(m.entro_cobros),
    Facturado: Number(m.facturado),
  })), [evo])

  // Reposición: ¿compro al ritmo que vendo?
  const comprado = r?.salio_mercaderia ?? 0
  const vendidoCosto = r?.costo_vendido ?? 0
  const difRepo = comprado - vendidoCosto

  // Cobros: contado vs fiado del mes
  const fiadoNuevo = r?.fiado_nuevo ?? 0
  const contadoMes = r?.entro_contado ?? 0
  const totalVenta = contadoMes + fiadoNuevo
  const porMetodo = (r?.por_metodo ?? []).map(m => ({
    metodo: METODO_LABELS[m.metodo] ?? m.metodo, monto: Number(m.monto),
  }))
  const tarjeta = porMetodo.filter(m => m.metodo === 'Débito' || m.metodo === 'Crédito').reduce((s, m) => s + m.monto, 0)
  const directo = porMetodo.filter(m => m.metodo === 'Efectivo' || m.metodo === 'Transferencia').reduce((s, m) => s + m.monto, 0)
  const deudaList = deuda ?? []
  const totalDeuda = deudaList.reduce((s, x) => s + Number(x.monto), 0)

  return (
    <div className="space-y-6 max-w-7xl mx-auto py-4">

      {/* Header + selector global de mes */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs text-gray-400 tracking-wide">Finanzas del negocio</p>
          <h1 className="text-2xl font-bold text-gray-900 mt-0.5 leading-none capitalize">{mesLabel(mes)}</h1>
        </div>
        <select
          value={mes}
          onChange={e => setMes(Number(e.target.value))}
          className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white capitalize focus:outline-none focus:ring-2 focus:ring-emerald-200"
        >
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i} value={i}>{mesLabel(i)}</option>
          ))}
        </select>
      </div>

      {/* ═══ A. CAJA DEL MES ═══ */}
      <Card>
        <Titulo sub="Plata que entró contra plata que salió, en el mes elegido">Caja del mes</Titulo>
        {loadResumen && !resumen ? (
          <Skeleton className="h-56 w-full rounded-xl" />
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ENTRÓ */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <ArrowDown size={13} className="text-emerald-500" />
                  <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Entró</span>
                </div>
                <div className="space-y-3">
                  <Fila label="Ventas de contado" monto={r?.entro_contado ?? 0} max={maxEntro} color={C.verde}
                    hint="efectivo, transferencia y tarjetas" mask={mask} />
                  <Fila label="Cobros de fiado" monto={r?.entro_cobros ?? 0} max={maxEntro} color={C.ambar}
                    hint="deuda vieja que los clientes pagaron" mask={mask} />
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Total entró</span>
                  <span className="text-sm font-bold text-emerald-600">{mask(formatPrecio(entro))}</span>
                </div>
              </div>

              {/* SALIÓ */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <ArrowUp size={13} className="text-rose-500" />
                  <span className="text-xs font-bold text-rose-500 uppercase tracking-wider">Salió</span>
                </div>
                <div className="space-y-3">
                  <Fila label="Ropa / mercadería" monto={r?.salio_mercaderia ?? 0} max={maxSalio} color={C.azul}
                    hint="compra de stock para revender" mask={mask} />
                  <Fila label="Local" monto={r?.salio_local ?? 0} max={maxSalio} color={C.verde}
                    hint="servicios, sueldos, alquiler…" mask={mask} />
                  <Fila label="Personal" monto={r?.salio_personal ?? 0} max={maxSalio} color={C.violeta}
                    hint="gastos de la familia" mask={mask} />
                  {(r?.salio_otros ?? 0) > 0 && (
                    <Fila label="Sin clasificar" monto={r?.salio_otros ?? 0} max={maxSalio} color={C.gris}
                      hint="gastos sin categoría asignada" mask={mask} />
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-600">Total salió</span>
                  <span className="text-sm font-bold text-rose-500">{mask(formatPrecio(salio))}</span>
                </div>
              </div>
            </div>

            {/* Resultado */}
            <div className="mt-6 pt-5 border-t border-gray-100">
              <div className="flex items-end justify-between flex-wrap gap-3">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Quedó en el mes</p>
                  <p className={`text-3xl font-bold mt-1 ${quedo >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {quedo < 0 ? '−' : ''}{mask(formatPrecio(Math.abs(quedo)))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] text-gray-400">Resultado del local (sin gastos personales)</p>
                  <p className={`text-lg font-bold ${resultadoLocal >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {resultadoLocal < 0 ? '−' : ''}{mask(formatPrecio(Math.abs(resultadoLocal)))}
                  </p>
                </div>
              </div>
              {/* barra comparativa entró vs salió */}
              <div className="mt-4 space-y-2">
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(entro / maxCaja) * 100}%`, backgroundColor: C.verde }} />
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(salio / maxCaja) * 100}%`, backgroundColor: C.rojo }} />
                </div>
              </div>
            </div>
          </>
        )}
      </Card>

      {/* ═══ B. GASTOS ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card delay={0.05}>
          <Titulo sub="De mayor a menor — dónde se va la plata">Gastos por rubro</Titulo>
          {rubrosList.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin gastos en el mes</div>
          ) : (
            <div className="space-y-3">
              {rubrosList.slice(0, 8).map(x => {
                const monto = Number(x.monto), prev = Number(x.monto_anterior)
                const pctTotal = totalRubros > 0 ? (monto / totalRubros) * 100 : 0
                const pctVenta = facturado > 0 ? (monto / facturado) * 100 : 0
                const dif = prev > 0 ? ((monto - prev) / prev) * 100 : null
                return (
                  <div key={x.nombre}>
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: GRUPO_COLOR[x.grupo] ?? C.gris }} />
                        <span className="text-xs text-gray-600 font-medium truncate">{x.nombre}</span>
                        <span className="text-[10px] text-gray-300 shrink-0">{x.grupo}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {dif !== null && Math.abs(dif) >= 1 && (
                          <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${dif > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                            {dif > 0 ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                            {Math.abs(dif).toFixed(0)}%
                          </span>
                        )}
                        <span className="text-xs font-bold text-gray-700">{mask(formatPrecio(monto))}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${(monto / maxRubro) * 100}%`, backgroundColor: GRUPO_COLOR[x.grupo] ?? C.gris }} />
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {pctTotal.toFixed(0)}% de los gastos · {pctVenta.toFixed(0)}% de lo vendido
                      {dif !== null && <span className="text-gray-300"> · mes pasado {mask(formatPrecio(prev))}</span>}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card delay={0.1}>
          <Titulo sub="12 meses — qué gasto se está disparando">Evolución de gastos</Titulo>
          {evoData.length === 0 ? (
            <Skeleton className="h-64 w-full rounded-xl" />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={evoData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={kFmt} width={44} />
                <Tooltip formatter={(v) => formatPrecio(Number(v))}
                  contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="Mercadería" stroke={C.azul} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Local" stroke={C.verde} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Personal" stroke={C.violeta} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ═══ C. REPOSICIÓN ═══ */}
      <Card delay={0.15}>
        <Titulo sub="Lo que gastaste en ropa contra el costo de lo que vendiste">
          ¿Estás reponiendo al ritmo que vendés?
        </Titulo>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-3">
            <Fila label="Compraste en ropa" monto={comprado} max={Math.max(comprado, vendidoCosto, 1)} color={C.azul} mask={mask} />
            <Fila label="Vendiste (a costo)" monto={vendidoCosto} max={Math.max(comprado, vendidoCosto, 1)} color={C.verde} mask={mask} />
            <div className={`rounded-xl p-3 ${difRepo < 0 ? 'bg-amber-50 border border-amber-100' : 'bg-emerald-50 border border-emerald-100'}`}>
              <p className={`text-xs font-semibold ${difRepo < 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                {difRepo < 0
                  ? `Repusiste ${mask(formatPrecio(Math.abs(difRepo)))} menos de lo que vendiste`
                  : `Repusiste ${mask(formatPrecio(difRepo))} más de lo que vendiste`}
              </p>
              <p className={`text-[11px] mt-0.5 ${difRepo < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {difRepo < 0
                  ? 'Estás vendiendo stock sin reponerlo: el inventario se achica.'
                  : 'Estás sumando stock. Ojo con inmovilizar plata si se repite.'}
              </p>
            </div>
          </div>
          <div className="lg:col-span-2">
            {evoData.length === 0 ? (
              <Skeleton className="h-56 w-full rounded-xl" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={evoData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={kFmt} width={44} />
                  <Tooltip formatter={(v) => formatPrecio(Number(v))}
                    contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Comprado" stroke={C.azul} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Vendido a costo" stroke={C.verde} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </Card>

      {/* ═══ D. COBROS Y FIADO ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card delay={0.2}>
          <Titulo sub="Cuánto de lo vendido entra ya y cuánto queda a cobrar">Contado vs fiado</Titulo>
          <div className="space-y-3">
            <Fila label="Contado (entra ya)" monto={contadoMes} max={Math.max(contadoMes, fiadoNuevo, 1)} color={C.verde} mask={mask} />
            <Fila label="Fiado (queda a cobrar)" monto={fiadoNuevo} max={Math.max(contadoMes, fiadoNuevo, 1)} color={C.rosa} mask={mask} />
          </div>
          <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Financiás el <strong className="text-gray-600">{totalVenta > 0 ? ((fiadoNuevo / totalVenta) * 100).toFixed(0) : 0}%</strong> de lo que vendés
            </span>
            <span className="text-xs font-bold text-gray-700">{mask(formatPrecio(totalVenta))}</span>
          </div>

          <div className="mt-5 pt-4 border-t border-gray-50">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-3">Tarjeta vs directo</p>
            <div className="space-y-3">
              <Fila label="Efectivo / transferencia" monto={directo} max={Math.max(directo, tarjeta, 1)} color={C.verde}
                hint="entra completo y al momento" mask={mask} />
              <Fila label="Débito / crédito" monto={tarjeta} max={Math.max(directo, tarjeta, 1)} color={C.ambar}
                hint="con comisión y demora de acreditación" mask={mask} />
            </div>
          </div>
        </Card>

        <Card delay={0.25}>
          <Titulo sub="Hace cuánto que te deben — a quién apretar primero">Antigüedad de la deuda</Titulo>
          {deudaList.length === 0 ? (
            <div className="h-40 flex items-center justify-center text-gray-300 text-sm">Sin deuda registrada</div>
          ) : (
            <>
              <div className="space-y-3">
                {deudaList.map(t => {
                  const monto = Number(t.monto)
                  const color = t.orden === 1 ? C.verde : t.orden === 2 ? C.ambar : t.orden === 3 ? '#FB923C' : C.rojo
                  return (
                    <div key={t.tramo}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                          <span className="text-xs text-gray-600 font-medium">{t.tramo}</span>
                          <span className="text-[10px] text-gray-300">{t.clientes} clientes</span>
                        </div>
                        <span className="text-xs font-bold text-gray-700">{mask(formatPrecio(monto))}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${totalDeuda > 0 ? (monto / totalDeuda) * 100 : 0}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-gray-50 flex items-center justify-between">
                <span className="text-xs text-gray-400">Deuda total</span>
                <span className="text-sm font-bold text-gray-700">{mask(formatPrecio(totalDeuda))}</span>
              </div>
              {(() => {
                const viejo = deudaList.filter(t => t.orden >= 3).reduce((s, t) => s + Number(t.monto), 0)
                if (viejo <= 0) return null
                return (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-2">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-700">
                      <strong>{mask(formatPrecio(viejo))}</strong> tiene más de 60 días. Cuanto más vieja, más difícil de cobrar.
                    </p>
                  </div>
                )
              })()}
            </>
          )}
        </Card>
      </div>

      {/* ═══ E. EVOLUCIÓN DEL FIADO ═══ */}
      <Card delay={0.3} className="mb-4">
        <Titulo sub="12 meses — si la deuda de los clientes crece o baja">Fiado nuevo vs cobrado</Titulo>
        {evoData.length === 0 ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={evoData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={kFmt} width={44} />
              <Tooltip formatter={(v) => formatPrecio(Number(v))} cursor={{ fill: 'rgba(16,185,129,0.06)' }}
                contentStyle={{ borderRadius: 12, border: 'none', fontSize: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Fiado" fill={C.rosa} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Cobrado" fill={C.verde} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
    </div>
  )
}
