'use client'

import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Categoria, Proveedor } from '@/types'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Minus, CheckCircle2, Package, ChevronRight, Search, X } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'

// ── Constantes del dominio ─────────────────────────────────────
const TALLES_POR_SISTEMA: Record<string, string[]> = {
  meses:    ['RN', '0-3m', '3-6m', '6-9m', '9-12m', '12-18m', '18-24m'],
  numerico: ['2', '4', '6', '8', '10', '12', '14', '16'],
  letras:   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  calzado:  ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36'],
}

const TIPOS_PRENDA = [
  'Remera', 'Buzo', 'Campera', 'Pantalón', 'Vestido', 'Pollera',
  'Musculosa', 'Body', 'Calza', 'Short', 'Bermuda', 'Conjunto',
  'Camisa', 'Chomba', 'Pijama', 'Medias',
]

const ESTILOS_POR_TIPO: Record<string, string[]> = {
  'Remera':   ['MC', 'ML', 'Sin Manga'],
  'Buzo':     ['Con Friza', 'Sin Friza', 'Canguro', 'Abierto'],
  'Campera':  ['Con Capucha', 'Inflable', 'Rompevientos', 'Polar'],
  'Pantalón': ['Jeans', 'Recto', 'Cargo', 'Con Puño', 'Jogging'],
  'Conjunto': ['Remera + Short', 'Remera + Pantalón', 'Buzo + Calza'],
  'Short':    ['Jeans', 'Deportivo', 'Con Vuelo'],
  'Bermuda':  ['Jeans', 'Cargo', 'Deportiva'],
  'Vestido':  ['Corto', 'Largo', 'Con Volados'],
}

const GENEROS = ['Nena', 'Nene', 'Unisex']

// ── Tipos ──────────────────────────────────────────────────────
type QuizStep = 'marca' | 'tipo' | 'producto' | 'nombre_nuevo' | 'precio' | 'talle' | 'cantidad' | 'listo'

interface ProductoExistente {
  id: string
  nombre: string
  precio_venta: number
  precio_costo: number
  categoria_id: string | null
  proveedor_id: string | null
  variantes: { id: string; talle: string; codigo_barras: string | null; stock: number; stock_minimo: number }[]
}

// ── Utilidades ─────────────────────────────────────────────────
function generarPrefijo(nombre: string): string {
  return nombre.toUpperCase().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 4)
}

function normalizarTalleParaCodigo(talle: string): string {
  const clean = talle.replace(/[^a-z0-9]/gi, '').toUpperCase()
  return clean.length === 1 ? '0' + clean : clean.slice(0, 4)
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ── Componente principal ───────────────────────────────────────
export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()
  const cantidadRef = useRef<HTMLInputElement>(null)

  // Datos cargados en mount
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [todosProductos, setTodosProductos] = useState<ProductoExistente[]>([])

  // Wizard state
  const [step, setStep] = useState<QuizStep>('marca')
  const [dir, setDir] = useState<'forward' | 'backward'>('forward')

  // Selecciones
  const [marca, setMarca] = useState<Proveedor | null>(null)
  const [tipo, setTipo] = useState<Categoria | null>(null)
  const [producto, setProducto] = useState<ProductoExistente | null>(null)
  const [esProductoNuevo, setEsProductoNuevo] = useState(false)
  const [talleSeleccionado, setTalleSeleccionado] = useState('')
  const [esVarianteNueva, setEsVarianteNueva] = useState(false)
  const [varianteExistenteId, setVarianteExistenteId] = useState<string | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [barcode, setBarcode] = useState('')

  // Para nuevos productos
  const [nombreNuevoProducto, setNombreNuevoProducto] = useState('')
  const [tipoPrenda, setTipoPrenda] = useState('')
  const [estiloPrenda, setEstiloPrenda] = useState<string | null>(null)  // null = aún no elegido, '' = omitido
  const [generoPrenda, setGeneroPrenda] = useState<string | null>(null)   // null = aún no elegido, '' = omitido
  const [otroTipoPrenda, setOtroTipoPrenda] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [temporada, setTemporada] = useState('todo_el_año')

  // Modal marca
  const [modalMarcaAbierto, setModalMarcaAbierto] = useState(false)
  const [busquedaMarca, setBusquedaMarca] = useState('')
  const [modoCrearMarcaEnModal, setModoCrearMarcaEnModal] = useState(false)
  const [nuevaMarcaNombre, setNuevaMarcaNombre] = useState('')
  const [loadingCrearMarca, setLoadingCrearMarca] = useState(false)

  // Inline creation (tipo y talle)
  const [modoCrear, setModoCrear] = useState<'tipo' | 'talle' | null>(null)
  const [inputCrear, setInputCrear] = useState('')
  const [sistemaNuevoTipo, setSistemaNuevoTipo] = useState('numerico')
  const [loadingCrear, setLoadingCrear] = useState(false)

  // Búsqueda de productos
  const [busquedaProducto, setBusquedaProducto] = useState('')

  // Sesión
  const [articulosCargados, setArticulosCargados] = useState(0)
  const [ultimoGuardado, setUltimoGuardado] = useState<{ nombre: string; talle: string; cantidad: number } | null>(null)
  const [loading, setLoading] = useState(false)

  // ── Carga de datos ─────────────────────────────────────────────
  const cargarTodo = useCallback(async () => {
    const [{ data: provs }, { data: cats }, { data: prods }] = await Promise.all([
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('*').eq('activa', true).order('nombre'),
      supabase.from('productos').select('*, variantes(id,talle,codigo_barras,stock,stock_minimo)').eq('activo', true).order('nombre'),
    ])
    setProveedores(provs || [])
    setCategorias(cats || [])
    setTodosProductos((prods || []) as ProductoExistente[])
  }, [supabase])

  useEffect(() => { cargarTodo() }, [cargarTodo])

  // Auto-abrir modal al llegar a paso marca
  useEffect(() => {
    if (step === 'marca') {
      setModalMarcaAbierto(true)
      setBusquedaMarca('')
      setModoCrearMarcaEnModal(false)
      setNuevaMarcaNombre('')
    }
  }, [step])

  // Auto-focus cantidad
  useEffect(() => {
    if (step === 'cantidad') setTimeout(() => cantidadRef.current?.focus(), 300)
  }, [step])

  // ── Navegación ─────────────────────────────────────────────────
  function irA(newStep: QuizStep, newDir: 'forward' | 'backward') {
    setDir(newDir)
    setStep(newStep)
    setModoCrear(null)
    setInputCrear('')
  }

  function goBack() {
    const prev: Record<QuizStep, QuizStep | null> = {
      marca: null,
      tipo: 'marca',
      producto: 'tipo',
      nombre_nuevo: 'producto',
      precio: 'nombre_nuevo',
      talle: esProductoNuevo ? 'precio' : 'producto',
      cantidad: 'talle',
      listo: 'cantidad',
    }
    const p = prev[step]
    if (p) irA(p, 'backward')
  }

  // ── Datos derivados ────────────────────────────────────────────
  const marcasFiltradas = busquedaMarca.trim()
    ? proveedores.filter(p =>
        normalizar(busquedaMarca).split(/\s+/).filter(Boolean).every(w => normalizar(p.nombre).includes(w))
      )
    : proveedores

  const tiposDeEstaMarca = categorias.filter(c =>
    todosProductos.some(p => p.proveedor_id === marca?.id && p.categoria_id === c.id)
  )
  const otrosTipos = categorias.filter(c => !tiposDeEstaMarca.some(t => t.id === c.id))

  const productosDeEsteMarcaTipo = todosProductos.filter(
    p => p.proveedor_id === marca?.id && p.categoria_id === tipo?.id
  )
  const productosFiltrados = busquedaProducto.trim()
    ? productosDeEsteMarcaTipo.filter(p =>
        normalizar(busquedaProducto).split(/\s+/).filter(Boolean).every(w => normalizar(p.nombre).includes(w))
      )
    : productosDeEsteMarcaTipo

  const tallesSugeridos = tipo?.sistema_talles ? (TALLES_POR_SISTEMA[tipo.sistema_talles] || []) : []
  const tallesExistentes = producto?.variantes || []
  const tallesFaltantes = tallesSugeridos.filter(t => !tallesExistentes.some(v => v.talle === t))

  const margen = precioCosto && precioVenta
    ? (((parseFloat(precioVenta) - parseFloat(precioCosto)) / parseFloat(precioCosto)) * 100).toFixed(0)
    : null

  // Nombre construido por el builder
  const tipoPrendaFinal = tipoPrenda === '__otro__' ? otroTipoPrenda.trim() : tipoPrenda
  const nombreGenerado = [tipoPrendaFinal, estiloPrenda || '', generoPrenda || '']
    .filter(Boolean).join(' ')

  // Cuándo mostrar cada sección del builder
  const builderTipoOk = tipoPrendaFinal.length > 0
  const builderEstiloOk = builderTipoOk && estiloPrenda !== null
  const builderGeneroOk = builderEstiloOk && generoPrenda !== null
  const estilosDisponibles = ESTILOS_POR_TIPO[tipoPrenda] || []

  // ── Generación de barcode ──────────────────────────────────────
  async function calcularBarcode(nombreProd: string, talle: string) {
    const prefix = generarPrefijo(nombreProd)
    const talleCode = normalizarTalleParaCodigo(talle)
    const base = `${prefix}${talleCode}`
    const { data } = await supabase
      .from('variantes').select('codigo_barras')
      .like('codigo_barras', `${base}%`)
      .order('codigo_barras', { ascending: false }).limit(10)
    let maxSeq = 0
    data?.forEach(row => {
      if (row.codigo_barras) {
        const num = parseInt(row.codigo_barras.slice(base.length))
        if (!isNaN(num) && num > maxSeq) maxSeq = num
      }
    })
    const varExist = tallesExistentes.find(v => v.talle === talle)
    setBarcode(varExist?.codigo_barras || `${base}${String(maxSeq + 1).padStart(3, '0')}`)
  }

  // ── Handlers de selección ──────────────────────────────────────
  function seleccionarMarca(p: Proveedor) {
    setMarca(p)
    setTipo(null); setProducto(null); setEsProductoNuevo(false)
    setTalleSeleccionado(''); setBarcode('')
    setModalMarcaAbierto(false)
    setBusquedaMarca('')
    irA('tipo', 'forward')
  }

  function seleccionarTipo(c: Categoria) {
    setTipo(c)
    setProducto(null); setEsProductoNuevo(false)
    setTalleSeleccionado(''); setBarcode('')
    irA('producto', 'forward')
  }

  function seleccionarProducto(p: ProductoExistente) {
    setProducto(p)
    setEsProductoNuevo(false)
    setTalleSeleccionado(''); setBarcode('')
    setBusquedaProducto('')
    irA('talle', 'forward')
  }

  function seleccionarNuevoProducto() {
    setEsProductoNuevo(true)
    setProducto(null)
    setNombreNuevoProducto('')
    setTipoPrenda(''); setEstiloPrenda(null); setGeneroPrenda(null); setOtroTipoPrenda('')
    setPrecioCosto(''); setPrecioVenta(''); setTemporada('todo_el_año')
    irA('nombre_nuevo', 'forward')
  }

  async function seleccionarTalle(talle: string, varianteId: string | null, esNueva: boolean) {
    setTalleSeleccionado(talle)
    setVarianteExistenteId(varianteId)
    setEsVarianteNueva(esNueva)
    setCantidad(1)
    const nombreProd = esProductoNuevo ? nombreNuevoProducto : (producto?.nombre || '')
    await calcularBarcode(nombreProd, talle)
    irA('cantidad', 'forward')
  }

  // ── Creación inline (modal marca) ──────────────────────────────
  async function confirmarCrearMarca() {
    const nombre = nuevaMarcaNombre.trim()
    if (!nombre) return
    setLoadingCrearMarca(true)
    const { data, error } = await supabase.from('proveedores').insert({ nombre, deuda_total: 0, activo: true }).select().single()
    if (error || !data) { toast.error(`Error: ${error?.message}`); setLoadingCrearMarca(false); return }
    await cargarTodo()
    setLoadingCrearMarca(false)
    seleccionarMarca(data as Proveedor)
  }

  // ── Creación inline (tipo/talle) ───────────────────────────────
  async function confirmarCrearTipo() {
    const nombre = inputCrear.trim()
    if (!nombre) return
    setLoadingCrear(true)
    const { data, error } = await supabase.from('categorias').insert({ nombre, sistema_talles: sistemaNuevoTipo, activa: true }).select().single()
    if (error || !data) { toast.error(`Error: ${error?.message}`); setLoadingCrear(false); return }
    await cargarTodo()
    setTipo(data as Categoria)
    setLoadingCrear(false)
    irA('producto', 'forward')
  }

  async function confirmarCrearTalle() {
    const talle = inputCrear.trim()
    if (!talle) return
    await seleccionarTalle(talle, null, true)
  }

  // ── Builder: confirmar nombre ──────────────────────────────────
  function confirmarNombre() {
    const nombre = nombreGenerado.trim()
    if (!nombre) { toast.error('Elegí al menos el tipo de prenda'); return }
    setNombreNuevoProducto(nombre)
    irA('precio', 'forward')
  }

  // ── Guardar ────────────────────────────────────────────────────
  async function guardar() {
    if (!talleSeleccionado) return
    setLoading(true)
    try {
      if (esProductoNuevo) {
        const { data: prod, error: errProd } = await supabase.from('productos').insert({
          nombre: nombreNuevoProducto.trim(),
          categoria_id: tipo?.id || null,
          proveedor_id: marca?.id || null,
          precio_costo: parseFloat(precioCosto) || 0,
          precio_venta: parseFloat(precioVenta) || 0,
          temporada: temporada || null,
        }).select().single()
        if (errProd || !prod) throw new Error(errProd?.message)
        const { error: errV } = await supabase.from('variantes').insert({
          producto_id: prod.id, talle: talleSeleccionado, codigo_barras: barcode || null, stock: cantidad, stock_minimo: 2,
        })
        if (errV) throw new Error(errV.message)

      } else if (esVarianteNueva || !varianteExistenteId) {
        const { error } = await supabase.from('variantes').insert({
          producto_id: producto!.id, talle: talleSeleccionado, codigo_barras: barcode || null, stock: cantidad, stock_minimo: 2,
        })
        if (error) throw new Error(error.message)

      } else {
        const { error } = await supabase.rpc('incrementar_stock', { p_variante_id: varianteExistenteId, p_cantidad: cantidad })
        if (error) throw new Error(error.message)
        const varExist = tallesExistentes.find(v => v.id === varianteExistenteId)
        if (barcode && !varExist?.codigo_barras) {
          await supabase.from('variantes').update({ codigo_barras: barcode }).eq('id', varianteExistenteId)
        }
      }

      const nombreFinal = esProductoNuevo ? nombreNuevoProducto : (producto?.nombre || '')
      setUltimoGuardado({ nombre: nombreFinal, talle: talleSeleccionado, cantidad })
      setArticulosCargados(n => n + 1)
      await cargarTodo()
      irA('listo', 'forward')
    } catch (e: unknown) {
      toast.error(`Error al guardar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }

  // ── Reset helpers ──────────────────────────────────────────────
  function cargarOtroTalle() { setTalleSeleccionado(''); setBarcode(''); setCantidad(1); irA('talle', 'backward') }
  function cargarOtroProducto() {
    setProducto(null); setEsProductoNuevo(false)
    setTalleSeleccionado(''); setBarcode(''); setCantidad(1); setBusquedaProducto('')
    irA('producto', 'backward')
  }
  function empezarDeNuevo() {
    setMarca(null); setTipo(null); setProducto(null); setEsProductoNuevo(false)
    setTalleSeleccionado(''); setBarcode(''); setCantidad(1); setBusquedaProducto('')
    irA('marca', 'backward')
  }

  // ── Breadcrumbs ────────────────────────────────────────────────
  type BC = { label: string; goTo: QuizStep }
  const breadcrumbs: BC[] = []
  if (marca && step !== 'marca') breadcrumbs.push({ label: marca.nombre, goTo: 'marca' })
  if (tipo && !['marca','tipo'].includes(step)) breadcrumbs.push({ label: tipo.nombre, goTo: 'tipo' })
  const prodNombre = esProductoNuevo ? nombreNuevoProducto : producto?.nombre
  if (prodNombre && !['marca','tipo','producto','nombre_nuevo','precio'].includes(step)) {
    breadcrumbs.push({ label: prodNombre, goTo: 'producto' })
  }

  // ── UI helpers ─────────────────────────────────────────────────
  const animClass = dir === 'forward' ? 'tk-slide-forward' : 'tk-slide-backward'

  function Chip({ label, sub, activo, onClick }: { label: string; sub?: string; activo?: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className="flex flex-col items-center justify-center rounded-2xl border py-3 px-3 text-sm font-bold transition-all active:scale-95 hover:scale-[1.02]"
        style={{
          background: activo ? 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' : 'white',
          borderColor: activo ? '#4EC3BD' : '#e5e7eb',
          color: activo ? 'white' : '#374151',
          boxShadow: activo ? '0 4px 12px rgba(78,195,189,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
        }}
      >
        <span>{label}</span>
        {sub && <span className="text-[10px] font-normal mt-0.5" style={{ opacity: activo ? 0.85 : 0.6 }}>{sub}</span>}
      </button>
    )
  }

  function ChipPeq({ label, activo, onClick }: { label: string; activo?: boolean; onClick: () => void }) {
    return (
      <button
        onClick={onClick}
        className="py-2 px-3 rounded-xl text-xs font-semibold border transition-all active:scale-95"
        style={{
          background: activo ? 'rgba(78,195,189,0.12)' : 'white',
          borderColor: activo ? '#4EC3BD' : '#e5e7eb',
          color: activo ? '#0d9488' : '#6b7280',
        }}
      >
        {label}
      </button>
    )
  }

  function BtnAgregar({ label, onClick }: { label: string; onClick: () => void }) {
    return (
      <button onClick={onClick} className="flex items-center gap-2 py-3 px-4 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all hover:border-teal-400 hover:text-teal-600" style={{ borderColor: '#d1d5db', color: '#6b7280', background: 'white' }}>
        <Plus size={15} style={{ color: '#4EC3BD' }} /> {label}
      </button>
    )
  }

  function InlineCrear({ placeholder, onConfirm, onCancel, loading: load, children }: {
    placeholder: string; onConfirm: () => void; onCancel: () => void; loading: boolean; children?: ReactNode
  }) {
    return (
      <div className="p-4 rounded-2xl space-y-3 tk-slide-forward" style={{ background: '#f0fdfb', border: '1px solid rgba(78,195,189,0.3)' }}>
        <Input value={inputCrear} onChange={e => setInputCrear(e.target.value)} onKeyDown={e => e.key === 'Enter' && onConfirm()} placeholder={placeholder} className="h-10 rounded-xl border-teal-200" autoFocus />
        {children}
        <div className="flex gap-2">
          <button onClick={onCancel} className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50">Cancelar</button>
          <button onClick={onConfirm} disabled={load || !inputCrear.trim()} className="flex-1 py-2 rounded-xl text-white font-bold text-sm disabled:opacity-50" style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}>
            {load ? '...' : 'Confirmar'}
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 pb-20">
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5 overflow-x-hidden">

        {/* Header */}
        <div className="flex items-center gap-3">
          {step === 'marca' ? (
            <Link href="/inventario">
              <button className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50">
                <ArrowLeft size={16} className="text-gray-500" />
              </button>
            </Link>
          ) : (
            <button onClick={goBack} className="w-9 h-9 rounded-xl border border-gray-200 bg-white flex items-center justify-center hover:bg-gray-50">
              <ArrowLeft size={16} className="text-gray-500" />
            </button>
          )}
          <div className="flex-1">
            <h1 className="text-xl font-black text-gray-900 leading-none" style={{ fontFamily: 'var(--font-display)' }}>Carga de stock</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              {articulosCargados > 0 && `${articulosCargados} artículo${articulosCargados > 1 ? 's' : ''} cargado${articulosCargados > 1 ? 's' : ''} · `}
              Rápido y fácil
            </p>
          </div>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {breadcrumbs.map((b, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <button onClick={() => irA(b.goTo, 'backward')} className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: 'rgba(78,195,189,0.1)', color: '#0d9488' }}>
                  {b.label}
                </button>
                {i < breadcrumbs.length - 1 && <ChevronRight size={12} className="text-gray-300" />}
              </span>
            ))}
          </div>
        )}

        {/* ── PASO MARCA ─────────────────────────────────────────── */}
        {step === 'marca' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Paso 1 de 6</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿De qué marca es?</h2>
              </div>
              <button
                onClick={() => setModalMarcaAbierto(true)}
                className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border-2 transition-all hover:border-teal-400"
                style={{ borderColor: '#e5e7eb', background: 'white' }}
              >
                <Search size={18} className="text-gray-400" />
                <span className="text-gray-500 font-medium">Seleccioná la marca...</span>
              </button>
            </div>
          </div>
        )}

        {/* ── PASO TIPO ──────────────────────────────────────────── */}
        {step === 'tipo' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Paso 2 de 6</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué tipo de producto?</h2>
              </div>

              {modoCrear === 'tipo' ? (
                <InlineCrear placeholder="Nombre de la categoría (ej: Buzos)" onConfirm={confirmarCrearTipo} onCancel={() => setModoCrear(null)} loading={loadingCrear}>
                  <div>
                    <p className="text-xs text-gray-500 mb-2 font-medium">Sistema de talles</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[['numerico','Numérico (2,4,6...)'],['letras','Letras (S,M,L...)'],['meses','Meses (0-3m...)'],['calzado','Calzado (18,19...)']].map(([v, l]) => (
                        <button key={v} onClick={() => setSistemaNuevoTipo(v)} className="py-2 px-3 rounded-xl text-xs font-semibold border transition-all"
                          style={{ background: sistemaNuevoTipo === v ? 'rgba(78,195,189,0.1)' : 'white', borderColor: sistemaNuevoTipo === v ? '#4EC3BD' : '#e5e7eb', color: sistemaNuevoTipo === v ? '#0d9488' : '#6b7280' }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                </InlineCrear>
              ) : (
                <div className="space-y-3">
                  {tiposDeEstaMarca.length > 0 && (
                    <div>
                      <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider mb-2">Categorías de {marca?.nombre}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {tiposDeEstaMarca.map(c => <Chip key={c.id} label={c.nombre} onClick={() => seleccionarTipo(c)} />)}
                      </div>
                    </div>
                  )}
                  {otrosTipos.length > 0 && (
                    <details>
                      <summary className="text-xs text-gray-400 font-semibold cursor-pointer hover:text-gray-600">Otras categorías ({otrosTipos.length})</summary>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {otrosTipos.map(c => <Chip key={c.id} label={c.nombre} onClick={() => seleccionarTipo(c)} />)}
                      </div>
                    </details>
                  )}
                  <BtnAgregar label="Nuevo tipo de producto" onClick={() => setModoCrear('tipo')} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PASO PRODUCTO ──────────────────────────────────────── */}
        {step === 'producto' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Paso 3 de 6</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué producto?</h2>
              </div>
              <div className="space-y-3">
                {productosDeEsteMarcaTipo.length > 5 && (
                  <Input value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)} placeholder="Buscar..." className="h-9 rounded-xl border-gray-200 text-sm" autoFocus />
                )}
                {productosFiltrados.length > 0 && (
                  <div className="space-y-1.5">
                    {productosFiltrados.map(p => {
                      const stockTotal = p.variantes.reduce((s, v) => s + v.stock, 0)
                      return (
                        <button key={p.id} onClick={() => seleccionarProducto(p)}
                          className="w-full flex justify-between items-center px-4 py-3 rounded-2xl border transition-all hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98]"
                          style={{ borderColor: '#e5e7eb', background: 'white' }}>
                          <span className="font-semibold text-sm text-gray-800 text-left">{p.nombre}</span>
                          <span className="text-xs font-medium ml-3 flex-shrink-0" style={{ color: stockTotal > 0 ? '#4EC3BD' : '#f97316' }}>{stockTotal} uds</span>
                        </button>
                      )
                    })}
                  </div>
                )}
                {productosDeEsteMarcaTipo.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No hay productos de {marca?.nombre} en {tipo?.nombre}</p>
                )}
                <BtnAgregar label="Nuevo producto" onClick={seleccionarNuevoProducto} />
              </div>
            </div>
          </div>
        )}

        {/* ── PASO NOMBRE_NUEVO: Constructor de nombre ───────────── */}
        {step === 'nombre_nuevo' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué tipo de prenda?</h2>
              </div>

              {/* Sección 1: Tipo de prenda */}
              <div>
                <div className="flex flex-wrap gap-2">
                  {TIPOS_PRENDA.map(t => (
                    <button key={t} onClick={() => { setTipoPrenda(t); setEstiloPrenda(null); setGeneroPrenda(null) }}
                      className="py-2 px-4 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                      style={{
                        background: tipoPrenda === t ? 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' : 'white',
                        borderColor: tipoPrenda === t ? '#4EC3BD' : '#e5e7eb',
                        color: tipoPrenda === t ? 'white' : '#374151',
                        boxShadow: tipoPrenda === t ? '0 4px 12px rgba(78,195,189,0.3)' : 'none',
                      }}>
                      {t}
                    </button>
                  ))}
                  <button onClick={() => { setTipoPrenda('__otro__'); setEstiloPrenda(null); setGeneroPrenda(null) }}
                    className="py-2 px-4 rounded-2xl text-sm font-bold border border-dashed transition-all"
                    style={{ borderColor: tipoPrenda === '__otro__' ? '#4EC3BD' : '#d1d5db', color: tipoPrenda === '__otro__' ? '#0d9488' : '#9ca3af', background: 'white' }}>
                    + Otra
                  </button>
                </div>
                {tipoPrenda === '__otro__' && (
                  <Input
                    value={otroTipoPrenda}
                    onChange={e => setOtroTipoPrenda(e.target.value)}
                    placeholder="Ej: Traje de baño, Calza térmica..."
                    className="h-9 rounded-xl border-gray-200 text-sm mt-2"
                    autoFocus
                  />
                )}
              </div>

              {/* Sección 2: Estilo (revelación progresiva) */}
              {builderTipoOk && (
                <div className="tk-slide-forward">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-gray-100" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      {estilosDisponibles.length > 0 ? 'Manga / Estilo' : 'Detalle adicional'}
                    </p>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  {estilosDisponibles.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {estilosDisponibles.map(e => (
                        <ChipPeq key={e} label={e} activo={estiloPrenda === e} onClick={() => setEstiloPrenda(estiloPrenda === e ? null : e)} />
                      ))}
                      <ChipPeq label="Omitir" activo={estiloPrenda === ''} onClick={() => setEstiloPrenda('')} />
                    </div>
                  ) : (
                    <button onClick={() => setEstiloPrenda('')} className="text-xs text-teal-600 font-semibold hover:text-teal-700">
                      {estiloPrenda === '' ? '✓ Continuando sin detalle' : 'Continuar sin detalle →'}
                    </button>
                  )}
                </div>
              )}

              {/* Sección 3: Género */}
              {builderEstiloOk && (
                <div className="tk-slide-forward">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-px flex-1 bg-gray-100" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">¿Para quién?</p>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {GENEROS.map(g => (
                      <ChipPeq key={g} label={g} activo={generoPrenda === g} onClick={() => setGeneroPrenda(generoPrenda === g ? null : g)} />
                    ))}
                    <ChipPeq label="Omitir" activo={generoPrenda === ''} onClick={() => setGeneroPrenda('')} />
                  </div>
                </div>
              )}

              {/* Preview del nombre + confirmar */}
              {builderGeneroOk && nombreGenerado && (
                <div className="tk-slide-forward space-y-3">
                  <div className="p-4 rounded-2xl text-center" style={{ background: '#f0fdfb', border: '1px solid rgba(78,195,189,0.25)' }}>
                    <p className="text-xs text-gray-400 mb-1">Nombre generado</p>
                    <p className="text-xl font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{nombreGenerado}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Código: <span className="font-mono text-teal-600">{generarPrefijo(nombreGenerado)}XX001</span></p>
                  </div>
                  <button
                    onClick={confirmarNombre}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                  >
                    Continuar con "{nombreGenerado}"
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PASO PRECIO ────────────────────────────────────────── */}
        {step === 'precio' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Cuánto sale?</h2>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#4EC3BD' }}>{nombreNuevoProducto}</p>
              </div>

              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Costo</p>
                    <Input type="number" value={precioCosto} onChange={e => setPrecioCosto(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" autoFocus />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Venta</p>
                    <Input type="number" value={precioVenta} onChange={e => setPrecioVenta(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" />
                  </div>
                  <div className="h-10 mt-auto flex items-center justify-center rounded-xl" style={{ background: '#f0fdfb', border: '1px solid #ccfbf1' }}>
                    {margen !== null ? (
                      <div className="text-center">
                        <p className="text-base font-black leading-none" style={{ color: Number(margen) >= 30 ? '#0d9488' : Number(margen) >= 15 ? '#d97706' : '#ef4444', fontFamily: 'var(--font-display)' }}>{margen}%</p>
                        <p className="text-[9px] text-gray-400">margen</p>
                      </div>
                    ) : <p className="text-xs text-gray-300">%</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Temporada</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[['todo_el_año','Todo el año'],['verano','Verano'],['invierno','Invierno'],['liquidacion','Liquidación']].map(([v,l]) => (
                      <button key={v} onClick={() => setTemporada(v)} className="py-2 rounded-xl text-xs font-semibold border transition-all"
                        style={{ background: temporada === v ? 'rgba(78,195,189,0.1)' : 'white', borderColor: temporada === v ? '#4EC3BD' : '#e5e7eb', color: temporada === v ? '#0d9488' : '#6b7280' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() => irA('talle', 'forward')}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                >
                  Siguiente → Elegir talle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO TALLE ─────────────────────────────────────────── */}
        {step === 'talle' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué talle?</h2>
                <p className="text-xs text-gray-400 mt-0.5">{esProductoNuevo ? nombreNuevoProducto : producto?.nombre}</p>
              </div>
              <div className="space-y-4">
                {!esProductoNuevo && tallesExistentes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Talles en stock</p>
                    <div className="grid grid-cols-3 gap-2">
                      {tallesExistentes.map(v => <Chip key={v.id} label={v.talle} sub={`${v.stock} uds`} onClick={() => seleccionarTalle(v.talle, v.id, false)} />)}
                    </div>
                  </div>
                )}
                {(esProductoNuevo ? tallesSugeridos : tallesFaltantes).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{esProductoNuevo ? 'Talles sugeridos' : 'Talles faltantes'}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(esProductoNuevo ? tallesSugeridos : tallesFaltantes).map(t => <Chip key={t} label={t} sub="+ nuevo" onClick={() => seleccionarTalle(t, null, true)} />)}
                    </div>
                  </div>
                )}
                {modoCrear === 'talle' ? (
                  <InlineCrear placeholder="Ej: T3, 37, Único..." onConfirm={confirmarCrearTalle} onCancel={() => setModoCrear(null)} loading={loadingCrear} />
                ) : (
                  <BtnAgregar label="Talle personalizado" onClick={() => setModoCrear('talle')} />
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── PASO CANTIDAD ──────────────────────────────────────── */}
        {step === 'cantidad' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-5">
              <div>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Cuántas unidades?</h2>
                <p className="text-xs text-gray-400 mt-0.5">{esProductoNuevo ? nombreNuevoProducto : producto?.nombre} · Talle {talleSeleccionado}</p>
              </div>
              <div className="flex items-center gap-3 justify-center">
                <button onClick={() => setCantidad(n => Math.max(1, n - 1))} className="w-12 h-12 rounded-2xl border-2 border-gray-200 flex items-center justify-center hover:border-teal-300 hover:text-teal-600 transition-all active:scale-90">
                  <Minus size={20} className="text-gray-500" />
                </button>
                <input ref={cantidadRef} type="number" value={cantidad} onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-28 h-16 rounded-2xl border-2 text-center text-3xl font-black text-gray-900 focus:outline-none focus:border-teal-400 transition-colors"
                  style={{ borderColor: '#e5e7eb', fontFamily: 'var(--font-display)' }} min={1} />
                <button onClick={() => setCantidad(n => n + 1)} className="w-12 h-12 rounded-2xl border-2 border-gray-200 flex items-center justify-center hover:border-teal-300 hover:text-teal-600 transition-all active:scale-90">
                  <Plus size={20} className="text-gray-500" />
                </button>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Código de barras</p>
                <div className="relative">
                  <Input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="Sin código" className="h-10 rounded-xl border-gray-200 text-sm font-mono pr-16" />
                  {barcode && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(78,195,189,0.1)', color: '#0d9488' }}>auto</span>}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Generado automáticamente · Podés editarlo o borrarlo</p>
              </div>
              <button onClick={guardar} disabled={loading}
                className="w-full py-4 rounded-2xl font-black text-base text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 20px rgba(78,195,189,0.4)', fontFamily: 'var(--font-display)' }}>
                {loading ? 'Guardando...' : <><CheckCircle2 size={20} /> Guardar {cantidad} unidad{cantidad !== 1 ? 'es' : ''}</>}
              </button>
            </div>
          </div>
        )}

        {/* ── PASO LISTO ─────────────────────────────────────────── */}
        {step === 'listo' && ultimoGuardado && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto" style={{ background: 'rgba(78,195,189,0.12)', border: '2px solid rgba(78,195,189,0.3)' }}>
                <CheckCircle2 size={32} style={{ color: '#4EC3BD' }} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¡Guardado!</h2>
                {articulosCargados > 1 && <p className="text-xs font-bold mt-1" style={{ color: '#4EC3BD' }}>{articulosCargados} artículos cargados esta sesión</p>}
              </div>
              <div className="rounded-2xl p-4 text-left space-y-2" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                <div className="flex justify-between"><span className="text-xs text-gray-500">Producto</span><span className="text-sm font-bold text-gray-800">{ultimoGuardado.nombre}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-500">Talle</span><span className="text-xs font-semibold text-gray-700">{ultimoGuardado.talle}</span></div>
                <div className="flex justify-between"><span className="text-xs text-gray-500">Unidades</span><span className="text-sm font-black" style={{ color: '#4EC3BD', fontFamily: 'var(--font-display)' }}>+{ultimoGuardado.cantidad}</span></div>
                {barcode && <div className="flex justify-between"><span className="text-xs text-gray-500">Código</span><span className="text-xs font-mono font-semibold text-gray-600">{barcode}</span></div>}
              </div>
              <div className="space-y-2">
                <button onClick={cargarOtroTalle} className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95" style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}>
                  + Otro talle de {esProductoNuevo ? nombreNuevoProducto : producto?.nombre}
                </button>
                <button onClick={cargarOtroProducto} className="w-full py-3 rounded-2xl font-semibold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">
                  Otro producto de {marca?.nombre}
                </button>
                <button onClick={empezarDeNuevo} className="w-full py-2.5 rounded-2xl font-medium text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cambiar de marca
                </button>
                <button onClick={() => router.push('/inventario')} className="w-full py-2.5 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Package size={14} /> Ver inventario
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ── MODAL DE MARCA ──────────────────────────────────────── */}
      {modalMarcaAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalMarcaAbierto(false) }}
        >
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl tk-slide-forward">

            {/* Header del modal */}
            <div className="px-5 pt-5 pb-3 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Seleccioná la marca</h3>
                <button onClick={() => setModalMarcaAbierto(false)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                  <X size={14} className="text-gray-500" />
                </button>
              </div>
              {!modoCrearMarcaEnModal && (
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <Input
                    value={busquedaMarca}
                    onChange={e => setBusquedaMarca(e.target.value)}
                    placeholder="Escribí para filtrar..."
                    className="h-10 pl-9 rounded-xl border-gray-200 text-sm"
                    autoFocus
                  />
                </div>
              )}
            </div>

            {/* Lista o formulario nueva marca */}
            {modoCrearMarcaEnModal ? (
              <div className="px-5 pb-5 space-y-3">
                <p className="text-sm font-semibold text-gray-600">Nueva marca / proveedor</p>
                <Input
                  value={nuevaMarcaNombre}
                  onChange={e => setNuevaMarcaNombre(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && confirmarCrearMarca()}
                  placeholder="Nombre de la marca"
                  className="h-10 rounded-xl border-gray-200 text-sm"
                  autoFocus
                />
                <div className="flex gap-2">
                  <button onClick={() => { setModoCrearMarcaEnModal(false); setNuevaMarcaNombre('') }} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50">Cancelar</button>
                  <button onClick={confirmarCrearMarca} disabled={loadingCrearMarca || !nuevaMarcaNombre.trim()} className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}>
                    {loadingCrearMarca ? '...' : 'Crear'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="overflow-y-auto max-h-64 border-t border-gray-100">
                  {marcasFiltradas.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-6">Sin resultados</p>
                  )}
                  {marcasFiltradas.map(p => (
                    <button key={p.id} onClick={() => seleccionarMarca(p)}
                      className="w-full text-left px-5 py-3.5 hover:bg-teal-50 border-b border-gray-50 last:border-0 transition-colors flex items-center justify-between">
                      <span className="font-semibold text-sm text-gray-800">{p.nombre}</span>
                      <ChevronRight size={14} className="text-gray-300" />
                    </button>
                  ))}
                </div>
                <div className="p-4 border-t border-gray-100">
                  <button onClick={() => setModoCrearMarcaEnModal(true)}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border-2 border-dashed text-sm font-semibold transition-all hover:border-teal-400 hover:text-teal-600"
                    style={{ borderColor: '#d1d5db', color: '#6b7280' }}>
                    <Plus size={15} style={{ color: '#4EC3BD' }} /> Nueva marca
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
