'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Caja } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Wallet, Plus, Lock, Unlock, History, ChevronDown, ChevronRight, X, Receipt } from 'lucide-react'
import { formatPrecio, cn } from '@/lib/utils'
import Link from 'next/link'

interface VentaDetalle {
  id: string
  creado_en: string
  cliente_nombre: string | null
  pagos: { metodo: string; monto: number }[]
  items: string
  total: number
}

interface AbonoDetalle {
  id: string
  creado_en: string
  cliente_nombre: string
  monto: number
  metodo_pago: string
}

interface CajaDetalle {
  ventas: VentaDetalle[]
  abonos: AbonoDetalle[]
  gastos: { concepto: string; monto: number; metodo_pago: string; fuente_pago?: string }[]
  loading: boolean
}

interface GastoDia {
  id: string
  concepto: string
  monto: number
  metodo_pago: string
  fuente_pago?: 'caja_hoy' | 'retiro_anterior'
  categoria?: { nombre: string; color: string } | null
}

interface Retiro {
  id: string
  caja_id: string
  monto: number
  motivo: string
  creado_en: string
}

export default function CajaPage() {
  const supabase = createClient()
  const { data: cajaCache, loading, refresh: cargarCaja } = useCache<{ caja: Caja | null; retiros: Retiro[]; gastosDia: GastoDia[] }>('caja:hoy', async () => {
    const hoy = new Date().toISOString().split('T')[0]

    const [{ data: cajaData }, { data: gastosData }] = await Promise.all([
      supabase
        .from('cajas')
        .select('*')
        .eq('fecha', hoy)
        .order('abierta_en', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('gastos')
        .select('id, concepto, monto, metodo_pago, fuente_pago, categoria:categorias_gastos(nombre, color)')
        .eq('fecha', hoy),
    ])

    let retirosArr: Retiro[] = []
    if (cajaData) {
      const { data: retirosData } = await supabase
        .from('retiros_caja')
        .select('*')
        .eq('caja_id', cajaData.id)
        .order('creado_en', { ascending: false })
      retirosArr = retirosData || []
    }

    return {
      caja: cajaData || null,
      retiros: retirosArr,
      gastosDia: (gastosData as unknown as GastoDia[]) || [],
    }
  })

  const [caja, setCaja] = useState<Caja | null>(null)
  const [retiros, setRetiros] = useState<Retiro[]>([])
  const [gastosDia, setGastosDia] = useState<GastoDia[]>([])
  // Sync cache to local state (allows local mutations after initial load)
  useEffect(() => {
    if (cajaCache) {
      setCaja(cajaCache.caja)
      setRetiros(cajaCache.retiros)
      setGastosDia(cajaCache.gastosDia)
    }
  }, [cajaCache])

  // Auto-cerrar cajas de días anteriores y auto-abrir la de hoy si no existe
  useEffect(() => {
    async function inicializarCaja() {
      const hoy = new Date().toISOString().split('T')[0]

      // Cerrar cajas abiertas de días anteriores
      const { data: anteriores } = await supabase
        .from('cajas')
        .select('id, fecha')
        .eq('estado', 'abierta')
        .lt('fecha', hoy)
      if (anteriores && anteriores.length > 0) {
        await Promise.all(anteriores.map(c =>
          supabase.from('cajas').update({
            estado: 'cerrada',
            cerrada_en: new Date().toISOString(),
            notas_cierre: 'Cierre automático a la medianoche',
          }).eq('id', c.id)
        ))
        toast.info('Se cerró automáticamente la caja del día anterior')
      }

      // Auto-abrir caja de hoy si no existe
      const { data: cajaHoy } = await supabase
        .from('cajas')
        .select('id')
        .eq('fecha', hoy)
        .limit(1)
        .maybeSingle()
      if (!cajaHoy) {
        await supabase.from('cajas').insert({
          fecha: hoy,
          monto_inicial: 0,
          total_efectivo: 0,
          total_transferencia: 0,
          total_debito: 0,
          total_credito: 0,
          total_fiado: 0,
          total_retiros: 0,
          estado: 'abierta',
        })
        cargarCaja()
      }
    }
    inicializarCaja()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [montoInicial, setMontoInicial] = useState('')
  const [editandoMontoInicial, setEditandoMontoInicial] = useState(false)
  const [montoInicialEdit, setMontoInicialEdit] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [montoRetiro, setMontoRetiro] = useState('')
  const [motivoRetiro, setMotivoRetiro] = useState('')

  const [notasCierreHoy, setNotasCierreHoy] = useState('')

  // Cajas anteriores
  const [mostrarAnteriores, setMostrarAnteriores] = useState(false)
  const [cajasAnteriores, setCajasAnteriores] = useState<Caja[]>([])
  const [loadingAnteriores, setLoadingAnteriores] = useState(false)
  const [cajaExpandida, setCajaExpandida] = useState<string | null>(null)
  const [periodoAnteriores, setPeriodoAnteriores] = useState(7)
  const [cajaDetalle, setCajaDetalle] = useState<Record<string, CajaDetalle>>({})


  async function abrirCaja() {
    const monto = parseFloat(montoInicial) || 0
    if (monto < 0) { toast.error('El monto inicial no puede ser negativo'); return }
    setAbriendo(true)
    const hoy = new Date().toISOString().split('T')[0]

    // Verificar que no exista caja abierta hoy
    const { data: existente } = await supabase
      .from('cajas')
      .select('id')
      .eq('fecha', hoy)
      .limit(1)
      .maybeSingle()
    if (existente) { await cargarCaja(); setAbriendo(false); return }

    const { data, error } = await supabase.from('cajas').insert({
      fecha: hoy,
      monto_inicial: monto,
      total_efectivo: 0,
      total_transferencia: 0,
      total_debito: 0,
      total_credito: 0,
      total_fiado: 0,
      total_retiros: 0,
      estado: 'abierta',
    }).select().single()
    if (error) { toast.error('Error al abrir caja: ' + error.message); setAbriendo(false); return }
    toast.success('Caja abierta')
    setCaja(data)
    setRetiros([])
    setMontoInicial('')
    setAbriendo(false)
  }

  async function reabrirCaja() {
    if (!caja) return
    setAbriendo(true)
    const { error } = await supabase
      .from('cajas')
      .update({ estado: 'abierta', cerrada_en: null })
      .eq('id', caja.id)
    if (error) { toast.error('Error al reabrir caja'); setAbriendo(false); return }
    toast.success('Caja reabierta')
    setCaja(prev => prev ? { ...prev, estado: 'abierta', cerrada_en: undefined } : null)
    setAbriendo(false)
  }

  async function guardarMontoInicial() {
    if (!caja) return
    const monto = Math.round(parseFloat(montoInicialEdit) || 0)
    const { error } = await supabase.from('cajas').update({ monto_inicial: monto }).eq('id', caja.id)
    if (error) { toast.error('Error al guardar: ' + error.message); return }
    setCaja(prev => prev ? { ...prev, monto_inicial: monto } : null)
    setEditandoMontoInicial(false)
    toast.success('Fondo inicial actualizado')
  }

  async function cerrarCaja() {
    if (!caja) return
    setCerrando(true)
    const notas = notasCierreHoy.trim() || null
    const { error } = await supabase.from('cajas').update({
      estado: 'cerrada',
      cerrada_en: new Date().toISOString(),
      notas_cierre: notas,
    }).eq('id', caja.id)
    if (error) { toast.error('Error al cerrar caja'); setCerrando(false); return }
    toast.success('Caja cerrada')
    setCaja(prev => prev ? { ...prev, estado: 'cerrada', cerrada_en: new Date().toISOString(), notas_cierre: notas || undefined } : null)
    setCerrando(false)
  }

  async function agregarRetiro() {
    const monto = parseFloat(montoRetiro)
    if (!monto || monto <= 0) { toast.error('Ingresá un monto válido'); return }
    if (!motivoRetiro.trim()) { toast.error('Ingresá un motivo'); return }
    if (!caja) return

    const efectivoEnCaja = (caja.monto_inicial || 0) + (caja.total_efectivo || 0) - (caja.total_retiros || 0)
    if (monto > efectivoEnCaja) {
      toast.error(`El retiro no puede superar el efectivo en caja (${formatPrecio(efectivoEnCaja)})`)
      return
    }

    const { error } = await supabase.from('retiros_caja').insert({
      caja_id: caja.id, monto, motivo: motivoRetiro,
    })
    if (error) { toast.error('Error al registrar retiro: ' + error.message); return }

    await supabase.from('cajas').update({ total_retiros: (caja.total_retiros || 0) + monto }).eq('id', caja.id)
    setCaja(prev => prev ? { ...prev, total_retiros: (prev.total_retiros || 0) + monto } : null)
    setRetiros(prev => [{ id: Date.now().toString(), caja_id: caja.id, monto, motivo: motivoRetiro, creado_en: new Date().toISOString() }, ...prev])
    setMontoRetiro('')
    setMotivoRetiro('')
    toast.success('Retiro registrado')
  }


  async function cargarDetalleCaja(cajaId: string, fecha: string) {
    if (cajaDetalle[cajaId] && !cajaDetalle[cajaId].loading) return
    setCajaDetalle(prev => ({ ...prev, [cajaId]: { ventas: [], abonos: [], gastos: [], loading: true } }))

    const nextDay = new Date(fecha + 'T00:00:00')
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayStr = nextDay.toISOString().split('T')[0]

    const [{ data: ventasData }, { data: abonosData }, { data: gastosData }] = await Promise.all([
      supabase
        .from('ventas')
        .select('id, creado_en, cliente:clientes(nombre), venta_pagos(metodo, monto), venta_items(cantidad, precio_unitario, variante:variantes(talle, producto:productos(nombre_base)))')
        .gte('creado_en', `${fecha}T00:00:00`)
        .lt('creado_en', `${nextDayStr}T00:00:00`)
        .neq('estado', 'anulada')
        .order('creado_en'),
      supabase
        .from('fiado_movimientos')
        .select('id, creado_en, monto, metodo_pago, cliente:clientes(nombre)')
        .eq('tipo', 'abono')
        .gte('creado_en', `${fecha}T00:00:00`)
        .lt('creado_en', `${nextDayStr}T00:00:00`)
        .order('creado_en'),
      supabase
        .from('gastos')
        .select('concepto, monto, metodo_pago, fuente_pago')
        .eq('fecha', fecha),
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ventas: VentaDetalle[] = (ventasData || []).map((v: any) => ({
      id: v.id,
      creado_en: v.creado_en,
      cliente_nombre: v.cliente?.nombre || null,
      pagos: (v.venta_pagos || []).map((p: { metodo: string; monto: number }) => ({ metodo: p.metodo, monto: p.monto })),
      items: (v.venta_items || []).map((i: { cantidad: number; variante?: { talle?: string; producto?: { nombre_base?: string } } }) =>
        `${i.variante?.producto?.nombre_base || '?'} ${i.variante?.talle || ''} x${i.cantidad}`
      ).join(', ') || '—',
      total: (v.venta_pagos || []).reduce((s: number, p: { monto: number }) => s + p.monto, 0),
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const abonos: AbonoDetalle[] = (abonosData || []).map((a: any) => ({
      id: a.id,
      creado_en: a.creado_en,
      cliente_nombre: a.cliente?.nombre || '—',
      monto: a.monto,
      metodo_pago: a.metodo_pago || 'efectivo',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gastos = (gastosData || []).map((g: any) => ({
      concepto: g.concepto,
      monto: g.monto,
      metodo_pago: g.metodo_pago,
      fuente_pago: g.fuente_pago,
    }))

    setCajaDetalle(prev => ({ ...prev, [cajaId]: { ventas, abonos, gastos, loading: false } }))
  }

  async function verAnteriores(dias?: number) {
    setMostrarAnteriores(true)
    setLoadingAnteriores(true)
    const d = dias ?? periodoAnteriores
    const hoy = new Date().toISOString().split('T')[0]
    const desde = new Date()
    desde.setDate(desde.getDate() - d)
    const desdeStr = desde.toISOString().split('T')[0]
    const { data } = await supabase
      .from('cajas')
      .select('*')
      .lt('fecha', hoy)
      .gte('fecha', desdeStr)
      .order('fecha', { ascending: false })
    const cajas = (data as Caja[]) || []
    setCajasAnteriores(cajas)
    setLoadingAnteriores(false)
  }

  function cambiarPeriodo(dias: number) {
    setPeriodoAnteriores(dias)
    verAnteriores(dias)
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  // total_cobros ya está incluido en total_efectivo/transferencia/debito — no sumar dos veces
  const totalVentas = caja
    ? (caja.total_efectivo || 0) + (caja.total_transferencia || 0) + (caja.total_debito || 0) + (caja.total_credito || 0) + (caja.total_fiado || 0)
    : 0

  const totalGastosDia = gastosDia.reduce((s, g) => s + g.monto, 0)
  const gastosEfectivo = gastosDia
    .filter(g => g.metodo_pago === 'efectivo' && (g.fuente_pago === 'caja_hoy' || !g.fuente_pago))
    .reduce((s, g) => s + g.monto, 0)

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-teal-100 rounded-lg"><Wallet size={24} className="text-teal-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Caja</h1>
            {caja && (
              <p className="text-gray-500 text-sm">
                {new Date(caja.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => verAnteriores()} className="gap-2 text-gray-600">
            <History size={15} /> Cajas anteriores
          </Button>
          {caja && (
            <Badge variant="outline" className={caja.estado === 'abierta' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-gray-100 text-gray-500'}>
              {caja.estado === 'abierta' ? 'Abierta' : 'Cerrada'}
            </Badge>
          )}
        </div>
      </div>


      {/* Sin caja hoy */}
      {!caja && (
        <Card>
          <CardHeader><CardTitle className="text-base">Abrir caja del día</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Monto inicial en efectivo</Label>
              <Input type="number" value={montoInicial} onChange={e => setMontoInicial(e.target.value)}
                placeholder="0" className="mt-1 text-lg" autoFocus />
            </div>
            <Button onClick={abrirCaja} disabled={abriendo} className="w-full bg-teal-500 hover:bg-teal-600">
              {abriendo ? 'Abriendo...' : 'Abrir caja del día'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Caja del día */}
      {caja && (
        <>
          {/* Totales */}
          <div className="grid grid-cols-2 gap-4">
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total ingresado</p>
                <p className="text-3xl font-bold text-gray-800 mt-1">{formatPrecio(totalVentas)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Fondo inicial</p>
                {editandoMontoInicial ? (
                  <div className="flex gap-2 mt-1 items-center">
                    <Input
                      type="number"
                      value={montoInicialEdit}
                      onChange={e => setMontoInicialEdit(e.target.value)}
                      className="text-xl font-bold h-9"
                      autoFocus
                      onKeyDown={async e => {
                        if (e.key === 'Enter') await guardarMontoInicial()
                        if (e.key === 'Escape') setEditandoMontoInicial(false)
                      }}
                    />
                    <Button size="sm" className="bg-teal-500 hover:bg-teal-600 shrink-0" onClick={guardarMontoInicial}>Ok</Button>
                  </div>
                ) : (
                  <p
                    className="text-3xl font-bold text-gray-800 mt-1 cursor-pointer hover:text-teal-600 transition-colors"
                    title="Clic para editar"
                    onClick={() => { setMontoInicialEdit(String(caja.monto_inicial || 0)); setEditandoMontoInicial(true) }}
                  >
                    {formatPrecio(caja.monto_inicial)}
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Desglose por método de pago</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {/* Ventas (sin cobros de deuda) */}
              {(() => {
                const ventasEfectivo = (caja.total_efectivo || 0) - (caja.total_cobros_efectivo || 0)
                const ventasTransferencia = (caja.total_transferencia || 0) - (caja.total_cobros_transferencia || 0)
                const ventasDebito = (caja.total_debito || 0) - (caja.total_cobros_debito || 0)
                const filas = [
                  { label: 'Efectivo',      value: ventasEfectivo,           color: 'text-green-600' },
                  { label: 'Transferencia', value: ventasTransferencia,      color: 'text-blue-600' },
                  { label: 'Débito',        value: ventasDebito,             color: 'text-purple-600' },
                  { label: 'Crédito',       value: caja.total_credito,       color: 'text-orange-600' },
                  { label: 'Fiado',         value: caja.total_fiado,         color: 'text-red-500' },
                ].filter(f => (f.value || 0) > 0)
                return filas.map(({ label, value, color }) => (
                  <div key={label} className="flex justify-between items-center">
                    <span className="text-gray-600">{label}</span>
                    <span className={`font-semibold ${color}`}>{formatPrecio(value || 0)}</span>
                  </div>
                ))
              })()}

              {/* Cobros de deuda por método */}
              {(caja.total_cobros || 0) > 0 && (
                <>
                  <Separator />
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Cobros de deuda</p>
                  {[
                    { label: 'Efectivo',      value: caja.total_cobros_efectivo,      color: 'text-teal-600' },
                    { label: 'Transferencia', value: caja.total_cobros_transferencia, color: 'text-teal-600' },
                    { label: 'Débito',        value: caja.total_cobros_debito,        color: 'text-teal-600' },
                  ].filter(f => (f.value || 0) > 0).map(({ label, value, color }) => (
                    <div key={`cobro-${label}`} className="flex justify-between items-center">
                      <span className="text-gray-600">{label}</span>
                      <span className={`font-semibold ${color}`}>{formatPrecio(value || 0)}</span>
                    </div>
                  ))}
                </>
              )}

              <Separator />
              <div className="flex justify-between items-center font-bold">
                <span>Total ingresado</span>
                <span className="text-gray-800">{formatPrecio(totalVentas)}</span>
              </div>
              {(caja.total_retiros || 0) > 0 && (
                <div className="flex justify-between items-center text-red-500">
                  <span>Retiros</span>
                  <span>− {formatPrecio(caja.total_retiros)}</span>
                </div>
              )}
              {gastosEfectivo > 0 && (
                <div className="flex justify-between items-center text-red-500">
                  <span>Gastos (efectivo)</span>
                  <span>− {formatPrecio(gastosEfectivo)}</span>
                </div>
              )}
              <div className="flex justify-between items-center font-bold text-lg border-t pt-2">
                <span>Efectivo en caja</span>
                <span className="text-green-600">
                  {formatPrecio((caja.monto_inicial || 0) + (caja.total_efectivo || 0) - (caja.total_retiros || 0) - gastosEfectivo)}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Gastos del día */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt size={16} className="text-red-400" /> Gastos del día
                </CardTitle>
                <Link href="/gastos">
                  <Button variant="ghost" size="sm" className="text-xs text-teal-600 hover:text-teal-700">
                    Ver todos
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {gastosDia.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Sin gastos registrados hoy</p>
              ) : (
                <div className="space-y-3">
                  {/* Desglose por método */}
                  <div className="grid grid-cols-2 gap-2">
                    {(['efectivo', 'transferencia', 'debito', 'credito'] as const).map(m => {
                      const tot = gastosDia.filter(g => g.metodo_pago === m).reduce((s, g) => s + g.monto, 0)
                      if (tot === 0) return null
                      const labels: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' }
                      return (
                        <div key={m} className="flex justify-between text-sm">
                          <span className="text-gray-500">{labels[m]}</span>
                          <span className="font-medium text-red-500">− {formatPrecio(tot)}</span>
                        </div>
                      )
                    })}
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center font-bold">
                    <span>Total gastos</span>
                    <span className="text-red-500">− {formatPrecio(totalGastosDia)}</span>
                  </div>
                  <Separator />
                  {/* Lista individual */}
                  <div className="space-y-2">
                    {gastosDia.map(g => (
                      <div key={g.id} className="flex items-center gap-2 text-sm">
                        {g.categoria && (
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.categoria.color }} />
                        )}
                        <span className="flex-1 text-gray-600 truncate">
                          {g.categoria ? `${g.categoria.nombre} — ` : ''}{g.concepto}
                        </span>
                        <Badge variant="outline" className="text-xs shrink-0">
                          {{ efectivo: 'Efect.', transferencia: 'Transf.', debito: 'Débito', credito: 'Crédito' }[g.metodo_pago] || g.metodo_pago}
                        </Badge>
                        <span className="font-medium text-gray-800 shrink-0">{formatPrecio(g.monto)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Retiros — solo si está abierta */}
          {caja.estado === 'abierta' && (
            <Card>
              <CardHeader><CardTitle className="text-base">Retiros de efectivo</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" value={montoRetiro} onChange={e => setMontoRetiro(e.target.value)} placeholder="Monto" />
                  <Input value={motivoRetiro} onChange={e => setMotivoRetiro(e.target.value)} placeholder="Motivo" className="col-span-2" />
                </div>
                <Button onClick={agregarRetiro} variant="outline" className="gap-2">
                  <Plus size={16} /> Agregar retiro
                </Button>
                {retiros.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {retiros.map(r => (
                      <div key={r.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 text-sm">
                        <span className="text-gray-600">{r.motivo}</span>
                        <div className="text-right">
                          <span className="font-medium text-red-500">{formatPrecio(r.monto)}</span>
                          <p className="text-xs text-gray-400">{new Date(r.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Acciones */}
          {caja.estado === 'abierta' ? (
            <div className="space-y-2">
              <Input
                value={notasCierreHoy}
                onChange={e => setNotasCierreHoy(e.target.value)}
                placeholder="Notas o anomalías al cerrar (opcional)"
                className="text-sm"
              />
              <Button onClick={cerrarCaja} disabled={cerrando} variant="outline"
                className="w-full border-red-200 text-red-600 hover:bg-red-50 gap-2">
                <Lock size={16} /> {cerrando ? 'Cerrando...' : 'Cerrar caja del día'}
            </Button>
            </div>
          ) : (
            <Card className="border-gray-200 bg-gray-50">
              <CardContent className="pt-5 pb-5">
                <div className="text-center mb-4">
                  <Lock size={22} className="mx-auto text-gray-400 mb-2" />
                  <p className="text-gray-500 text-sm">
                    Caja cerrada{caja.cerrada_en
                      ? ` a las ${new Date(caja.cerrada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                      : ''}
                  </p>
                </div>
                <Button
                  onClick={reabrirCaja}
                  disabled={abriendo}
                  className="w-full bg-teal-500 hover:bg-teal-600 gap-2"
                >
                  <Unlock size={15} /> {abriendo ? 'Reabriendo...' : 'Reabrir caja'}
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modal Cajas Anteriores */}
      {mostrarAnteriores && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <History size={18} className="text-teal-500" />
                  <h2 className="font-bold text-gray-800">Cajas anteriores</h2>
                </div>
                <button onClick={() => setMostrarAnteriores(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={20} />
                </button>
              </div>
              <div className="flex gap-1.5">
                {[
                  { dias: 7, label: '7 días' },
                  { dias: 15, label: '15 días' },
                  { dias: 30, label: '30 días' },
                  { dias: 90, label: '3 meses' },
                ].map(f => (
                  <button
                    key={f.dias}
                    onClick={() => cambiarPeriodo(f.dias)}
                    className={cn(
                      'text-xs font-semibold px-3 py-1.5 rounded-full border transition-all',
                      periodoAnteriores === f.dias
                        ? 'bg-teal-500 border-teal-500 text-white'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-teal-300 hover:text-teal-600'
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resumen del período */}
            {!loadingAnteriores && cajasAnteriores.length > 0 && (() => {
              const totalPeriodo = cajasAnteriores.reduce((s, c) =>
                s + (c.total_efectivo || 0) + (c.total_transferencia || 0) + (c.total_debito || 0) + (c.total_credito || 0) + (c.total_fiado || 0), 0)
              return (
                <div className="px-6 py-3 border-t border-gray-100 bg-gray-50 flex flex-wrap gap-4 justify-between">
                  <div>
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">Total ventas</p>
                    <p className="text-sm font-bold text-gray-700">{formatPrecio(totalPeriodo)}</p>
                  </div>
                </div>
              )
            })()}

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
              {loadingAnteriores ? (
                <p className="text-center text-gray-400 py-8">Cargando...</p>
              ) : cajasAnteriores.length === 0 ? (
                <p className="text-center text-gray-400 py-8">No hay cajas anteriores</p>
              ) : cajasAnteriores.map(c => {
                const tot = (c.total_efectivo || 0) + (c.total_transferencia || 0) + (c.total_debito || 0) + (c.total_credito || 0) + (c.total_fiado || 0)
                const abierta = cajaExpandida === c.id
                return (
                  <div key={c.id} className={cn('rounded-2xl border overflow-hidden transition-all', abierta ? 'border-teal-200' : 'border-gray-100')}>
                    <button
                      onClick={() => {
                        const nueva = abierta ? null : c.id
                        setCajaExpandida(nueva)
                        if (nueva) cargarDetalleCaja(c.id, c.fecha)
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-800 capitalize">
                          {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {c.estado === 'cerrada'
                            ? `Cerrada${c.cerrada_en ? ` a las ${new Date(c.cerrada_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                            : 'Sin cerrar'}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold text-gray-800 text-sm">{formatPrecio(tot)}</p>
                        <Badge variant="outline" className={cn('text-xs mt-0.5', c.estado === 'cerrada' ? 'text-gray-400' : 'text-green-600')}>
                          {c.estado === 'cerrada' ? 'Cerrada' : 'Abierta'}
                        </Badge>
                      </div>
                      {abierta ? <ChevronDown size={14} className="text-gray-300 shrink-0" /> : <ChevronRight size={14} className="text-gray-300 shrink-0" />}
                    </button>

                    {abierta && (() => {
                      const det = cajaDetalle[c.id]
                      const METODO_COLOR: Record<string, string> = {
                        efectivo: 'bg-green-100 text-green-700',
                        transferencia: 'bg-blue-100 text-blue-700',
                        debito: 'bg-purple-100 text-purple-700',
                        credito: 'bg-orange-100 text-orange-700',
                        fiado: 'bg-red-100 text-red-600',
                      }
                      const METODO_LABEL: Record<string, string> = {
                        efectivo: 'Efectivo', transferencia: 'Transf.', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado',
                      }
                      return (
                        <div className="border-t border-gray-100">
                          {/* Totales resumen */}
                          <div className="px-4 py-3 bg-gray-50 space-y-1.5">
                            {[
                              { label: 'Fondo inicial', value: c.monto_inicial, color: '' },
                              { label: 'Efectivo', value: c.total_efectivo, color: 'text-green-700' },
                              { label: 'Transferencia', value: c.total_transferencia, color: 'text-blue-700' },
                              { label: 'Débito', value: c.total_debito, color: 'text-purple-700' },
                              { label: 'Crédito', value: c.total_credito, color: 'text-orange-600' },
                              { label: 'Fiado', value: c.total_fiado, color: 'text-red-500' },
                              ...(c.total_cobros > 0 ? [{ label: 'Cobros deuda', value: c.total_cobros, color: 'text-teal-600' }] : []),
                              { label: 'Retiros', value: -(c.total_retiros || 0), color: 'text-red-500' },
                            ].filter(r => (r.value || 0) !== 0).map(({ label, value, color }) => (
                              <div key={label} className="flex justify-between text-xs">
                                <span className="text-gray-500">{label}</span>
                                <span className={cn('font-semibold', color || 'text-gray-800')}>
                                  {(value || 0) < 0 ? `− ${formatPrecio(Math.abs(value || 0))}` : formatPrecio(value || 0)}
                                </span>
                              </div>
                            ))}
                            <Separator className="my-1" />
                            <div className="flex justify-between text-xs font-bold">
                              <span>Efectivo en caja</span>
                              <span className="text-green-700">{formatPrecio(
                                (c.monto_inicial || 0) + (c.total_efectivo || 0) - (c.total_retiros || 0) -
                                (det?.gastos?.filter(g => g.metodo_pago === 'efectivo' && (g.fuente_pago === 'caja_hoy' || !g.fuente_pago)).reduce((s, g) => s + g.monto, 0) || 0)
                              )}</span>
                            </div>
                            {c.notas_cierre && (
                              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mt-1">
                                <span className="font-semibold">Notas:</span> {c.notas_cierre}
                              </p>
                            )}
                          </div>

                          {/* Transacciones */}
                          {det?.loading && (
                            <p className="text-center text-xs text-gray-400 py-4">Cargando transacciones...</p>
                          )}
                          {det && !det.loading && (
                            <div className="px-4 pb-4 pt-3 space-y-4">
                              {/* Ventas */}
                              {det.ventas.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Ventas ({det.ventas.length})</p>
                                  <div className="space-y-1.5">
                                    {det.ventas.map(v => (
                                      <div key={v.id} className="rounded-xl border border-gray-100 px-3 py-2 bg-white">
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1 min-w-0">
                                            <p className="text-xs font-semibold text-gray-700 truncate">
                                              {v.cliente_nombre || 'Sin cliente'}
                                              <span className="text-gray-400 font-normal ml-1.5">
                                                {new Date(v.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                              </span>
                                            </p>
                                            <p className="text-[10px] text-gray-400 truncate mt-0.5">{v.items}</p>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-gray-800">{formatPrecio(v.total)}</p>
                                            <div className="flex gap-1 mt-0.5 justify-end flex-wrap">
                                              {v.pagos.map((p, i) => (
                                                <span key={i} className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', METODO_COLOR[p.metodo] || 'bg-gray-100 text-gray-600')}>
                                                  {METODO_LABEL[p.metodo] || p.metodo}
                                                  {v.pagos.length > 1 && ` ${formatPrecio(p.monto)}`}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Cobros de deuda */}
                              {det.abonos.length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Cobros de deuda ({det.abonos.length})</p>
                                  <div className="space-y-1.5">
                                    {det.abonos.map(a => (
                                      <div key={a.id} className="rounded-xl border border-teal-100 px-3 py-2 bg-teal-50/40 flex items-center justify-between">
                                        <div>
                                          <p className="text-xs font-semibold text-gray-700">{a.cliente_nombre}</p>
                                          <p className="text-[10px] text-gray-400">
                                            {new Date(a.creado_en).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                          </p>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-xs font-bold text-teal-700">{formatPrecio(a.monto)}</p>
                                          <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full', METODO_COLOR[a.metodo_pago] || 'bg-gray-100 text-gray-600')}>
                                            {METODO_LABEL[a.metodo_pago] || a.metodo_pago}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Gastos */}
                              {det.gastos.filter(g => g.fuente_pago !== 'retiro_anterior').length > 0 && (
                                <div>
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Gastos del día</p>
                                  <div className="space-y-1.5">
                                    {det.gastos.filter(g => g.fuente_pago !== 'retiro_anterior').map((g, i) => (
                                      <div key={i} className="rounded-xl border border-red-100 px-3 py-2 bg-red-50/30 flex items-center justify-between">
                                        <p className="text-xs text-gray-600">{g.concepto}</p>
                                        <p className="text-xs font-bold text-red-600">− {formatPrecio(g.monto)}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {det.ventas.length === 0 && det.abonos.length === 0 && det.gastos.length === 0 && (
                                <p className="text-center text-xs text-gray-400 py-2">Sin transacciones registradas</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
