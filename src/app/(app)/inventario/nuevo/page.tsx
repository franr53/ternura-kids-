'use client'

import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Categoria, Proveedor, TipoPrenda, Colegio } from '@/types'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Minus, CheckCircle2, Package, ChevronRight, Search, X, RefreshCw, Sparkles, FileDown, MessageCircle, Phone, Tag, Trash2, ChevronUp, Loader2 } from 'lucide-react'
import Link from 'next/link'
import { formatPrecio } from '@/lib/utils'
import {
  type EtiquetaData,
  generarPDFEtiquetas,
  compartirPDFWhatsApp,
  getWhatsAppTel,
  setWhatsAppTel,
} from '@/lib/etiquetas-pdf'

// ── Constantes del dominio ─────────────────────────────────────
const TALLES_POR_SISTEMA: Record<string, string[]> = {
  meses:    ['RN', '0-3m', '3-6m', '6-9m', '9-12m', '12-18m', '18-24m'],
  numerico: ['2', '4', '6', '8', '10', '12', '14', '16'],
  letras:   ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
  calzado:  ['18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33','34','35','36'],
}

// Tipos sugeridos por categoría (para ordenar el selector)
const TIPOS_POR_CATEGORIA: Record<string, string[]> = {
  nena:     ['Remera', 'Vestido', 'Calza', 'Buzo', 'Campera', 'Bermuda', 'Short', 'Pantalón', 'Body', 'Medias'],
  nene:     ['Remera', 'Pantalón', 'Bermuda', 'Buzo', 'Campera', 'Short', 'Medias'],
  bebe:     ['Body', 'Mameluco', 'Ajuar', 'Remera', 'Pantalón', 'Buzo', 'Medias'],
  colegial: ['Chomba', 'Pantalón', 'Calza', 'Campera', 'Buzo', 'Remera'],
  calzado:  ['Zapatilla', 'Sandalia', 'Bota', 'Pantufla', 'Ojota', 'Zapato'],
  ropa:     ['Remera', 'Calza', 'Buzo', 'Campera', 'Pantalón', 'Short'],
  acceso:   ['Mochila', 'Cartera', 'Gorro', 'Bufanda', 'Cinturón'],
}

const DETALLES_POR_TIPO: Record<string, string[]> = {
  remera:   ['Lisa', 'Estampada', 'M/C', 'M/L', 'Rayada', 'Fit'],
  pantalon: ['Liso', 'Cargo', 'Recto', 'Jogger', 'Oxford'],
  buzo:     ['Liso', 'Estampado', 'Canguro', 'Frisa'],
  campera:  ['Lisa', 'Con capucha', 'Rompeviento', 'Pluma'],
  bermuda:  ['Lisa', 'Cargo', 'Jogger'],
  short:    ['Liso', 'Deportivo', 'Cargo'],
  vestido:  ['Liso', 'Estampado', 'Con vuelo'],
  calza:    ['Lisa', 'Estampada', 'Ciclista'],
  medias:   ['Lisas', 'Con diseño', 'Antideslizante'],
  body:     ['Manga corta', 'Manga larga', 'Sin mangas'],
  mameluco: ['Liso', 'Estampado'],
  ajuar:    ['Completo', 'Set 2 piezas'],
}


// ── Tipos ──────────────────────────────────────────────────────
type QuizStep = 'inicio' | 'buscar_existente' | 'marca' | 'tipo' | 'categoria' | 'genero' | 'producto' | 'nombre_nuevo' | 'precio' | 'precio_existente' | 'talle' | 'revisar_lote' | 'listo'

type GeneroSeleccionado = 'bebe' | 'nena' | 'nene' | 'unisex' | null

interface TalleSeleccion {
  cantidad: number
  varianteId: string | null
  esNueva: boolean
  barcode: string
  precioCosto: string
  precioVenta: string
}

const MARGEN_SUGERIDO = 2.5

interface ProductoExistente {
  id: string
  nombre_base: string
  categoria_id: string | null
  marca_id: string | null
  variantes: { id: string; talle: string; codigo_barras: string | null; stock: number; stock_minimo: number; precio_venta: number; precio_costo: number }[]
}

// ── Tipos de lote ──────────────────────────────────────────
interface ItemLote {
  id: string
  productoId: string | null
  esProductoNuevo: boolean
  nombreProducto: string
  marcaNombre: string
  marcaId: string | null
  categoriaId: string | null
  temporada: string | null
  precioCosto: number
  precioVenta: number
  quiereCambiarPrecio: boolean
  talles: Record<string, {
    cantidad: number
    varianteId: string | null
    esNueva: boolean
    barcode: string
    precioCosto: string
    precioVenta: string
  }>
  variantesExistentes: { id: string; talle: string; codigo_barras: string | null; stock: number; stock_minimo: number; precio_venta: number; precio_costo: number }[]
}

// ── Utilidades ─────────────────────────────────────────────────
function generarPrefijo(nombre: string): string {
  return nombre.toUpperCase().split(/\s+/).map(w => w[0]).filter(Boolean).join('').slice(0, 4)
}

function normalizarTalleParaCodigo(talle: string): string {
  return talle.replace(/[^a-z0-9]/gi, '').toUpperCase()
}

function subcatParaCategoria(nombre: string): string {
  const n = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (n === 'nena') return 'NA'
  if (n === 'nene') return 'NO'
  if (n.includes('bebe') || n === 'bb') return 'BB'
  if (n.includes('colegia')) return 'COL'
  if (n.includes('calzado')) return ''
  if (n.includes('ropa') && n.includes('inter')) return 'RI'
  if (n.includes('acceso')) return 'ACC'
  if (n.includes('perfum')) return 'PRF'
  return nombre.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}

function abreviaturaMarca(nombre: string): string {
  return nombre.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3)
}


function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function getDetallesIniciales(tipoPrendaNombre: string): string[] {
  const n = normalizar(tipoPrendaNombre)
  const key = Object.keys(DETALLES_POR_TIPO).find(k => n.includes(k))
  return key ? DETALLES_POR_TIPO[key] : []
}

function cargarDetallesGuardados(tipoPrendaId: string): string[] {
  try {
    const raw = localStorage.getItem(`inv:detalles:${tipoPrendaId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function guardarDetalleNuevo(tipoPrendaId: string, detalle: string): void {
  try {
    const actuales = cargarDetallesGuardados(tipoPrendaId)
    if (!actuales.includes(detalle)) {
      localStorage.setItem(`inv:detalles:${tipoPrendaId}`, JSON.stringify([...actuales, detalle]))
    }
  } catch { /* ignore */ }
}

// ── Componente principal ───────────────────────────────────────
export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()

  // Datos cargados en mount
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [todosProductos, setTodosProductos] = useState<ProductoExistente[]>([])
  const [tiposPrenda, setTiposPrenda] = useState<TipoPrenda[]>([])
  const [colegios, setColegios] = useState<Colegio[]>([])

  // Wizard state
  const [step, setStep] = useState<QuizStep>('marca')
  const [dir, setDir] = useState<'forward' | 'backward'>('forward')
  const [vinoDeExistente, setVinoDeExistente] = useState(false)

  // Selecciones
  const [marca, setMarca] = useState<Proveedor | null>(null)
  const [tipo, setTipo] = useState<Categoria | null>(null)
  const [producto, setProducto] = useState<ProductoExistente | null>(null)
  const [esProductoNuevo, setEsProductoNuevo] = useState(false)
  const [tallesSeleccionados, setTallesSeleccionados] = useState<Record<string, TalleSeleccion>>({})
  // Keep single barcode for backward compat (used in listo step display)
  const [barcode, setBarcode] = useState('')

  // Para nuevos productos
  const [nombreNuevoProducto, setNombreNuevoProducto] = useState('')
  const [tipoPrendaObj, setTipoPrendaObj] = useState<TipoPrenda | null>(null)
  const [colegioObj, setColegioObj] = useState<Colegio | null>(null)
  const [detalleLibre, setDetalleLibre] = useState('')
  const [detallesDisponibles, setDetallesDisponibles] = useState<string[]>([])
  const [inputNuevoDetalle, setInputNuevoDetalle] = useState('')
  const [mostrarInputNuevoDetalle, setMostrarInputNuevoDetalle] = useState(false)
  const [modoLibre, setModoLibre] = useState(false)
  const [nombreLibre, setNombreLibre] = useState('')
  // Modales agregar tipo / colegio
  const [modalTipoAbierto, setModalTipoAbierto] = useState(false)
  const [nuevoTipoNombre, setNuevoTipoNombre] = useState('')
  const [nuevoTipoAbrev, setNuevoTipoAbrev] = useState('')
  const [nuevoTipoAbrevManual, setNuevoTipoAbrevManual] = useState(false)
  const [loadingNuevoTipo, setLoadingNuevoTipo] = useState(false)
  const [modalColegioAbierto, setModalColegioAbierto] = useState(false)
  const [nuevoColegioNombre, setNuevoColegioNombre] = useState('')
  const [nuevoColegioAbrev, setNuevoColegioAbrev] = useState('')
  const [loadingNuevoColegio, setLoadingNuevoColegio] = useState(false)
  // estados legacy (mantenidos para compatibilidad con partes no modificadas)
  const [generoSeleccionado, setGeneroSeleccionado] = useState<GeneroSeleccionado>(null)
  const [tipoPrenda, setTipoPrenda] = useState('')
  const [estiloPrenda, setEstiloPrenda] = useState<string | null>(null)
  const [generoPrenda, setGeneroPrenda] = useState<string | null>(null)
  const [otroTipoPrenda, setOtroTipoPrenda] = useState('')
  const [colegioNombre, setColegioNombre] = useState('')
  const [precioCosto, setPrecioCosto] = useState('')
  const [precioVenta, setPrecioVenta] = useState('')
  const [precioVentaEditado, setPrecioVentaEditado] = useState(false)
  const [quiereCambiarPrecio, setQuiereCambiarPrecio] = useState(false)
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
  const [busquedaExistente, setBusquedaExistente] = useState('')

  // Sesión
  const [articulosCargados, setArticulosCargados] = useState(0)
  const [ultimoGuardado, setUltimoGuardado] = useState<{ nombre: string; talle: string; cantidad: number } | null>(null)
  const [loading, setLoading] = useState(false)

  // Sesión acumulada para etiquetas
  interface ProductoCargado {
    nombre: string
    marca: string
    talles: { talle: string; cantidad: number; codigoBarras?: string; precioVenta: number }[]
  }
  const [productosCargados, setProductosCargados] = useState<ProductoCargado[]>([])
  const [modalFinAbierto, setModalFinAbierto] = useState(false)
  const [telefonoWA, setTelefonoWA] = useState('')
  const [generandoPDF, setGenerandoPDF] = useState(false)

  // Lote batch
  const [loteActual, setLoteActual] = useState<ItemLote[]>([])
  const [loadingConfirmar, setLoadingConfirmar] = useState(false)
  const [confirmProgress, setConfirmProgress] = useState<{ current: number; total: number } | null>(null)
  const [panelLoteExpandido, setPanelLoteExpandido] = useState(false)

  // Cargar teléfono de localStorage en mount
  useEffect(() => { setTelefonoWA(getWhatsAppTel()) }, [])

  // ── Carga de datos ─────────────────────────────────────────────
  const cargarTodo = useCallback(async () => {
    const [{ data: provs }, { data: cats }, { data: prods }, { data: tipos }, { data: cols }] = await Promise.all([
      supabase.from('marcas').select('*').eq('activo', true).order('nombre'),
      supabase.from('categorias').select('*').eq('activa', true).order('nombre'),
      supabase.from('productos').select('*, variantes(id,talle,codigo_barras,stock,stock_minimo,precio_venta,precio_costo)').eq('activo', true).order('nombre_base'),
      supabase.from('tipos_prenda').select('*').eq('activo', true).order('nombre'),
      supabase.from('colegios').select('*').eq('activo', true).order('nombre'),
    ])
    setProveedores(provs || [])
    setCategorias(cats || [])
    setTodosProductos((prods || []) as ProductoExistente[])
    setTiposPrenda((tipos || []) as TipoPrenda[])
    setColegios((cols || []) as Colegio[])
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

  // Reset talles al entrar al paso talle
  // (no need for auto-focus since talle step uses chip buttons)

  // ── Navegación ─────────────────────────────────────────────────
  function irA(newStep: QuizStep, newDir: 'forward' | 'backward') {
    setDir(newDir)
    setStep(newStep)
    setModoCrear(null)
    setInputCrear('')
  }

  function goBack() {
    const prev: Record<QuizStep, QuizStep | null> = {
      inicio: null,
      buscar_existente: null,
      marca: null,
      tipo: 'producto',
      categoria: 'producto',
      genero: 'categoria',
      producto: 'marca',
      nombre_nuevo: 'categoria',
      precio: 'nombre_nuevo',
      precio_existente: 'producto',
      talle: esProductoNuevo ? 'precio' : 'producto',
      revisar_lote: null,
      listo: 'talle',
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
    todosProductos.some(p => p.marca_id === marca?.id && p.categoria_id === c.id)
  )
  const otrosTipos = categorias.filter(c => !tiposDeEstaMarca.some(t => t.id === c.id))

  // Todos los productos de la marca, para el paso "producto"
  const productosDeEstaMarca = todosProductos.filter(p => p.marca_id === marca?.id)
  const productosFiltrados = busquedaProducto.trim()
    ? productosDeEstaMarca.filter(p =>
        normalizar(busquedaProducto).split(/\s+/).filter(Boolean).every(w => normalizar(p.nombre_base).includes(w))
      )
    : productosDeEstaMarca
  // Agrupados por categoría para mostrar en el paso producto
  const productosPorCategoria = categorias
    .filter(c => productosFiltrados.some(p => p.categoria_id === c.id))
    .map(c => ({ categoria: c, productos: productosFiltrados.filter(p => p.categoria_id === c.id) }))

  // Tipos de prenda ordenados por relevancia para la categoría y marca actuales
  const productosDeEstaMarcaYCat = useMemo(() =>
    todosProductos.filter(p => p.marca_id === marca?.id && (!tipo || p.categoria_id === tipo.id)),
    [todosProductos, marca, tipo]
  )

  const tiposOrdenados = useMemo(() => {
    const catNorm = tipo ? normalizar(tipo.nombre) : ''
    const catKey = Object.keys(TIPOS_POR_CATEGORIA).find(k => catNorm.includes(k))
    const sugeridos = catKey ? TIPOS_POR_CATEGORIA[catKey] : []
    const conteos = new Map<string, number>()
    tiposPrenda.forEach(t => {
      const c = productosDeEstaMarcaYCat.filter(p =>
        normalizar(p.nombre_base).startsWith(normalizar(t.nombre))
      ).length
      if (c > 0) conteos.set(t.id, c)
    })
    return [...tiposPrenda].sort((a, b) => {
      const ai = sugeridos.findIndex(s => normalizar(s) === normalizar(a.nombre))
      const bi = sugeridos.findIndex(s => normalizar(s) === normalizar(b.nombre))
      const aIdx = ai === -1 ? 999 : ai
      const bIdx = bi === -1 ? 999 : bi
      if (aIdx !== bIdx) return aIdx - bIdx
      return (conteos.get(b.id) ?? 0) - (conteos.get(a.id) ?? 0)
    })
  }, [tiposPrenda, productosDeEstaMarcaYCat, tipo])

  const tallesSugeridos = tipo?.sistema_talles ? (TALLES_POR_SISTEMA[tipo.sistema_talles] || []) : []
  const tallesExistentes = producto?.variantes || []
  const tallesFaltantes = tallesSugeridos.filter(t => !tallesExistentes.some(v => v.talle === t))

  const margen = precioCosto && precioVenta
    ? (((parseFloat(precioVenta) - parseFloat(precioCosto)) / parseFloat(precioCosto)) * 100).toFixed(0)
    : null

  const precioLista = parseFloat(precioVenta) || 0
  const precioEfectivo = Math.round(precioLista * 0.8)

  const precioCostoNum = parseFloat(precioCosto) || 0
  const precioVentaNum = parseFloat(precioVenta) || 0
  const errorVentaMenorCosto = precioVentaNum > 0 && precioCostoNum > 0 && precioVentaNum < precioCostoNum
  const advertenciaMargenBajo = margen !== null && Number(margen) >= 0 && Number(margen) < 20 && !errorVentaMenorCosto
  const advertenciaMargenAlto = margen !== null && Number(margen) > 300 && !errorVentaMenorCosto

  function handleCostoChange(valor: string) {
    setPrecioCosto(valor)
    const costo = parseFloat(valor)
    if (!isNaN(costo) && costo > 0 && !precioVentaEditado) {
      const sugerido = Math.round(costo * MARGEN_SUGERIDO / 100) * 100
      setPrecioVenta(String(sugerido))
    }
  }

  function handleVentaChange(valor: string) {
    setPrecioVenta(valor)
    setPrecioVentaEditado(true)
  }

  // Nombre construido por el builder
  const tipoPrendaFinal = tipoPrendaObj?.nombre || ''
  const esCalzado = tipo?.sistema_talles === 'calzado'
  const esColegial = tipo?.nombre?.toLowerCase().includes('colegia') ?? false
  // Regla: [Tipo] [Detalle libre] [Marca] + [Colegio si es Colegial]
  const nombreGenerado = [
    tipoPrendaFinal,
    detalleLibre.trim(),
    marca?.nombre || '',
    esColegial ? colegioObj?.nombre || '' : '',
  ].filter(Boolean).join(' ')

  // Cuándo mostrar cada sección del builder
  const builderTipoOk = tipoPrendaObj !== null

  // Resetear detalle al cambiar tipo de prenda y cargar chips
  useEffect(() => {
    setDetalleLibre('')
    setColegioObj(null)
    setInputNuevoDetalle('')
    setMostrarInputNuevoDetalle(false)
    if (tipoPrendaObj) {
      const iniciales = getDetallesIniciales(tipoPrendaObj.nombre)
      const guardados = cargarDetallesGuardados(tipoPrendaObj.id)
      const todos = [...iniciales]
      guardados.forEach(d => { if (!todos.includes(d)) todos.push(d) })
      setDetallesDisponibles(todos)
    } else {
      setDetallesDisponibles([])
    }
  }, [tipoPrendaObj])

  // ── Generación de barcode ──────────────────────────────────────
  function calcularPrefijoCodigo(): string {
    const tipoAbrev = tipoPrendaObj?.abreviatura || generarPrefijo(tipoPrendaObj?.nombre || '')
    const catAbrev  = tipo ? subcatParaCategoria(tipo.nombre) : 'XX'
    const marcaAbrev = marca ? abreviaturaMarca(marca.nombre) : 'XX'
    const colegioAbrev = esColegial && colegioObj ? colegioObj.abreviatura : ''
    return `${tipoAbrev}${catAbrev}${marcaAbrev}${colegioAbrev}`
  }

  async function calcularBarcodeParaTalle(talle: string): Promise<string> {
    const varExist = tallesExistentes.find(v => v.talle === talle)
    if (varExist?.codigo_barras) return varExist.codigo_barras

    if (esProductoNuevo && tipoPrendaObj && tipo && marca) {
      const talleCode = normalizarTalleParaCodigo(talle)
      return `${calcularPrefijoCodigo()}${talleCode}`
    } else {
      const nombreProd = producto?.nombre_base || ''
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
      return `${base}${maxSeq > 0 ? String(maxSeq + 1).padStart(3, '0') : ''}`
    }
  }

  // ── Handlers de selección ──────────────────────────────────────
  function seleccionarProductoExistente(p: ProductoExistente) {
    // Setear marca y tipo desde el producto para que el barcode y breadcrumbs funcionen
    const prov = proveedores.find(v => v.id === p.marca_id) || null
    const cat  = categorias.find(c => c.id === p.categoria_id) || null
    setMarca(prov)
    setTipo(cat)
    setProducto(p)
    setEsProductoNuevo(false)
    setVinoDeExistente(true)
    setQuiereCambiarPrecio(false)
    setPrecioCosto(String(p.variantes?.[0]?.precio_costo || ''))
    setPrecioVenta(String(p.variantes?.[0]?.precio_venta || ''))
    setPrecioVentaEditado(false)
    setTallesSeleccionados({}); setBarcode('')
    setBusquedaExistente('')
    irA('talle', 'forward')
  }

  function seleccionarMarca(p: Proveedor) {
    setMarca(p)
    setTipo(null); setProducto(null); setEsProductoNuevo(false)
    setVinoDeExistente(false)
    setTallesSeleccionados({}); setBarcode('')
    setModalMarcaAbierto(false)
    setBusquedaMarca('')
    irA('producto', 'forward')
  }

  function seleccionarTipo(c: Categoria) {
    setTipo(c)
    setProducto(null)
    setTallesSeleccionados({}); setBarcode('')
    irA('nombre_nuevo', 'forward')
  }

  function seleccionarCategoria(c: Categoria) {
    setTipo(c)
    setProducto(null)
    setTallesSeleccionados({}); setBarcode('')
    if (c.sistema_talles === 'calzado') {
      setGeneroSeleccionado(null)
      irA('nombre_nuevo', 'forward')
    } else {
      setGeneroSeleccionado(null)
      irA('nombre_nuevo', 'forward')
    }
  }

  function seleccionarProducto(p: ProductoExistente) {
    const cat = categorias.find(c => c.id === p.categoria_id) || null
    setTipo(cat)
    setProducto(p)
    setEsProductoNuevo(false)
    setQuiereCambiarPrecio(false)
    setPrecioCosto(String(p.variantes?.[0]?.precio_costo || ''))
    setPrecioVenta(String(p.variantes?.[0]?.precio_venta || ''))
    setPrecioVentaEditado(false)
    setTallesSeleccionados({}); setBarcode('')
    setBusquedaProducto('')
    irA('talle', 'forward')
  }

  function seleccionarNuevoProducto() {
    setEsProductoNuevo(true)
    setProducto(null)
    setNombreNuevoProducto('')
    setTipoPrendaObj(null); setColegioObj(null); setDetalleLibre('')
    setModoLibre(false); setNombreLibre('')
    setPrecioCosto(''); setPrecioVenta(''); setPrecioVentaEditado(false); setTemporada('todo_el_año')
    irA('categoria', 'forward')
  }

  async function toggleTalle(talle: string, varianteId: string | null, esNueva: boolean) {
    // Pre-fill prices: variant-level > form-level
    const varExist = tallesExistentes.find(v => v.talle === talle)
    const defaultCosto = varExist?.precio_costo ? String(varExist.precio_costo) : precioCosto
    const defaultVenta = varExist?.precio_venta ? String(varExist.precio_venta) : precioVenta

    setTallesSeleccionados(prev => {
      if (prev[talle]) {
        const next = { ...prev }
        delete next[talle]
        return next
      }
      return { ...prev, [talle]: { cantidad: 1, varianteId, esNueva, barcode: '', precioCosto: defaultCosto, precioVenta: defaultVenta } }
    })
    // Calcular barcode en background
    const bc = await calcularBarcodeParaTalle(talle)
    setTallesSeleccionados(prev => {
      if (!prev[talle]) return prev
      return { ...prev, [talle]: { ...prev[talle], barcode: bc } }
    })
  }

  function setCantidadTalle(talle: string, cant: number) {
    setTallesSeleccionados(prev => {
      if (!prev[talle]) return prev
      return { ...prev, [talle]: { ...prev[talle], cantidad: Math.max(1, cant) } }
    })
  }

  function setPrecioTalle(talle: string, campo: 'precioCosto' | 'precioVenta', valor: string) {
    setTallesSeleccionados(prev => {
      if (!prev[talle]) return prev
      return { ...prev, [talle]: { ...prev[talle], [campo]: valor } }
    })
  }

  // ── Creación inline (modal marca) ──────────────────────────────
  async function confirmarCrearMarca() {
    const nombre = nuevaMarcaNombre.trim()
    if (!nombre) return
    setLoadingCrearMarca(true)
    const { data, error } = await supabase.from('marcas').insert({ nombre, deuda_total: 0, activo: true }).select().single()
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
    setLoadingCrear(false)
    seleccionarCategoria(data as Categoria)
  }

  async function confirmarCrearTalle() {
    const talle = inputCrear.trim()
    if (!talle) return
    setModoCrear(null)
    setInputCrear('')
    await toggleTalle(talle, null, true)
  }

  // ── Crear Tipo de Prenda (modal) ───────────────────────────────
  async function confirmarCrearTipoPrenda() {
    const nombre = nuevoTipoNombre.trim()
    const abreviatura = nuevoTipoAbrev.trim().toUpperCase()
    if (!nombre || !abreviatura) { toast.error('Completá nombre y abreviatura'); return }
    setLoadingNuevoTipo(true)
    const { data, error } = await supabase.from('tipos_prenda').insert({ nombre, abreviatura, activo: true }).select().single()
    if (error || !data) { toast.error(`Error: ${error?.message}`); setLoadingNuevoTipo(false); return }
    await cargarTodo()
    setLoadingNuevoTipo(false)
    setTipoPrendaObj(data as TipoPrenda)
    setModalTipoAbierto(false)
    setNuevoTipoNombre(''); setNuevoTipoAbrev(''); setNuevoTipoAbrevManual(false)
  }

  // ── Crear Colegio (modal) ──────────────────────────────────────
  async function confirmarCrearColegio() {
    const nombre = nuevoColegioNombre.trim()
    const abreviatura = nuevoColegioAbrev.trim().toUpperCase()
    if (!nombre || !abreviatura) { toast.error('Completá nombre y abreviatura'); return }
    setLoadingNuevoColegio(true)
    const { data, error } = await supabase.from('colegios').insert({ nombre, abreviatura, activo: true }).select().single()
    if (error || !data) { toast.error(`Error: ${error?.message}`); setLoadingNuevoColegio(false); return }
    await cargarTodo()
    setLoadingNuevoColegio(false)
    setColegioObj(data as Colegio)
    setModalColegioAbierto(false)
    setNuevoColegioNombre(''); setNuevoColegioAbrev('')
  }

  // ── Builder: confirmar nombre ──────────────────────────────────
  function confirmarNombre() {
    const nombre = nombreGenerado.trim()
    if (!nombre) { toast.error('Elegí al menos el tipo de prenda'); return }
    setNombreNuevoProducto(nombre)
    irA('precio', 'forward')
  }

  function confirmarNombreLibre() {
    const nombre = nombreLibre.trim()
    if (!nombre) return
    setNombreNuevoProducto(nombre)
    irA('precio', 'forward')
  }

  // ── Agregar al lote (sin DB) ────────────────────────────────
  function agregarAlLote() {
    const entries = Object.entries(tallesSeleccionados)
    if (entries.length === 0) return
    const nombreFinal = esProductoNuevo ? nombreNuevoProducto.trim() : (producto?.nombre_base || '')
    const totalUnidades = entries.reduce((s, [, sel]) => s + sel.cantidad, 0)
    const item: ItemLote = {
      id: crypto.randomUUID(),
      productoId: producto?.id || null,
      esProductoNuevo,
      nombreProducto: nombreFinal,
      marcaNombre: marca?.nombre || '',
      marcaId: marca?.id || null,
      categoriaId: tipo?.id || null,
      temporada: temporada || null,
      precioCosto: parseFloat(precioCosto) || 0,
      precioVenta: parseFloat(precioVenta) || 0,
      quiereCambiarPrecio,
      talles: Object.fromEntries(entries.map(([t, sel]) => [t, { ...sel }])),
      variantesExistentes: tallesExistentes,
    }
    setLoteActual(prev => [...prev, item])
    toast.success(`${nombreFinal} agregado al lote (${totalUnidades} uds)`)
    empezarDeNuevo()
  }

  // ── Confirmar lote (guardar todo en DB) ─────────────────────
  async function confirmarLote() {
    if (loteActual.length === 0) return
    setLoadingConfirmar(true)
    setConfirmProgress({ current: 0, total: loteActual.length })
    type ProductoCargadoLocal = { nombre: string; marca: string; talles: { talle: string; cantidad: number; codigoBarras?: string; precioVenta: number }[] }
    const cargados: ProductoCargadoLocal[] = []
    const fallidos: ItemLote[] = []

    for (let i = 0; i < loteActual.length; i++) {
      const item = loteActual[i]
      setConfirmProgress({ current: i + 1, total: loteActual.length })
      try {
        let productoId = item.productoId
        if (item.esProductoNuevo) {
          const { data: prod, error: errProd } = await supabase.from('productos').insert({
            nombre_base: item.nombreProducto,
            categoria_id: item.categoriaId,
            marca_id: item.marcaId,
            temporada: item.temporada,
            activo: true,
          }).select().single()
          if (errProd || !prod) throw new Error(errProd?.message || 'Error creando producto')
          productoId = prod.id
        }

        const entries = Object.entries(item.talles)
        for (const [talle, sel] of entries) {
          const talleCosto = parseFloat(sel.precioCosto) || null
          const talleVenta = parseFloat(sel.precioVenta) || null
          if (item.esProductoNuevo || sel.esNueva || !sel.varianteId) {
            const { error } = await supabase.from('variantes').insert({
              producto_id: productoId!, talle, codigo_barras: sel.barcode || null, stock: sel.cantidad, stock_minimo: 2,
              precio_costo: talleCosto, precio_venta: talleVenta,
            })
            if (error) throw new Error(error.message)
          } else {
            const { error } = await supabase.rpc('incrementar_stock', { p_variante_id: sel.varianteId, p_cantidad: sel.cantidad })
            if (error) throw new Error(error.message)
            const updateData: Record<string, unknown> = {}
            if (talleCosto != null) updateData.precio_costo = talleCosto
            if (talleVenta != null) updateData.precio_venta = talleVenta
            const varExist = item.variantesExistentes.find(v => v.id === sel.varianteId)
            if (sel.barcode && !varExist?.codigo_barras) updateData.codigo_barras = sel.barcode
            if (Object.keys(updateData).length > 0) {
              await supabase.from('variantes').update(updateData).eq('id', sel.varianteId)
            }
          }
        }
        cargados.push({
          nombre: item.nombreProducto,
          marca: item.marcaNombre,
          talles: entries.map(([t, sel]) => ({
            talle: t,
            cantidad: sel.cantidad,
            codigoBarras: sel.barcode || undefined,
            precioVenta: parseFloat(sel.precioVenta) || item.precioVenta,
          })),
        })
      } catch (e: unknown) {
        toast.error(`Error en "${item.nombreProducto}": ${e instanceof Error ? e.message : String(e)}`)
        fallidos.push(item)
      }
    }

    const totalUds = cargados.reduce((s, p) => s + p.talles.reduce((ss, t) => ss + t.cantidad, 0), 0)
    setArticulosCargados(n => n + cargados.reduce((s, p) => s + p.talles.length, 0))
    setProductosCargados(prev => [...prev, ...cargados])
    setUltimoGuardado({
      nombre: cargados.length === 1 ? cargados[0].nombre : `${cargados.length} artículos`,
      talle: cargados.length === 1 ? Object.keys(loteActual[0]?.talles || {}).join(', ') : '',
      cantidad: totalUds,
    })

    if (fallidos.length > 0) {
      setLoteActual(fallidos)
      toast.warning(`${fallidos.length} artículo${fallidos.length > 1 ? 's' : ''} con error — podés reintentar`)
    } else {
      setLoteActual([])
      if (cargados.length > 0) toast.success(`${cargados.length} artículo${cargados.length > 1 ? 's' : ''} guardados correctamente`)
    }
    await cargarTodo()
    setLoadingConfirmar(false)
    setConfirmProgress(null)
    irA('listo', 'forward')
  }

  // ── Eliminar del lote ──────────────────────────────────────
  function eliminarDelLote(id: string) {
    setLoteActual(prev => prev.filter(item => item.id !== id))
  }

  // ── Reset helpers ──────────────────────────────────────────────
  function cargarOtroTalle() { setTallesSeleccionados({}); setBarcode(''); irA('talle', 'backward') }
  function cargarOtroProducto() {
    setProducto(null); setEsProductoNuevo(false)
    setTallesSeleccionados({}); setBarcode(''); setBusquedaProducto('')
    irA('producto', 'backward')
  }
  function empezarDeNuevo() {
    setMarca(null); setTipo(null); setProducto(null); setEsProductoNuevo(false)
    setVinoDeExistente(false); setGeneroSeleccionado(null)
    setTallesSeleccionados({}); setBarcode(''); setBusquedaProducto(''); setBusquedaExistente('')
    irA('marca', 'backward')
  }

  // ── Breadcrumbs ────────────────────────────────────────────────
  type BC = { label: string; goTo: QuizStep }
  const breadcrumbs: BC[] = []
  if (marca && !['marca'].includes(step)) breadcrumbs.push({ label: marca.nombre, goTo: 'marca' })
  if (tipo && !['marca','tipo','categoria','producto'].includes(step)) breadcrumbs.push({ label: tipo.nombre, goTo: 'categoria' })
  const prodNombre = esProductoNuevo ? nombreNuevoProducto : producto?.nombre_base
  if (prodNombre && !['marca','tipo','categoria','genero','producto','nombre_nuevo','precio','precio_existente'].includes(step)) {
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

  // ── Panel de lote ──────────────────────────────────────────────
  function renderPanelLote() {
    const totalUds = loteActual.reduce((s, item) => s + Object.values(item.talles).reduce((ss, sel) => ss + sel.cantidad, 0), 0)
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-gray-900 text-sm" style={{ fontFamily: 'var(--font-display)' }}>Carga actual</h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(78,195,189,0.1)', color: '#0d9488' }}>
            {loteActual.length} art · {totalUds} uds
          </span>
        </div>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {loteActual.map(item => {
            const catNombre = categorias.find(c => c.id === item.categoriaId)?.nombre
            const totalUdsItem = Object.values(item.talles).reduce((s, sel) => s + sel.cantidad, 0)
            return (
              <div key={item.id} className="rounded-xl p-3 space-y-1.5" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-gray-800 truncate">{item.nombreProducto}</p>
                    <p className="text-[10px] text-gray-400">
                      {[item.marcaNombre, catNombre].filter(Boolean).join(' · ')}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {item.precioVenta > 0 && (
                        <span className="text-[10px] font-semibold" style={{ color: '#0d9488' }}>{formatPrecio(item.precioVenta)}</span>
                      )}
                      <span className="text-[10px] text-gray-400">{totalUdsItem} ud{totalUdsItem !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <button onClick={() => eliminarDelLote(item.id)} className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-red-50 flex-shrink-0 transition-colors">
                    <Trash2 size={12} className="text-gray-400 hover:text-red-500" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(item.talles).map(([t, sel]) => (
                    <span key={t} className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(78,195,189,0.08)', color: '#0d9488' }}>
                      {t} ×{sel.cantidad}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        <button
          onClick={() => irA('revisar_lote', 'forward')}
          className="w-full py-3 rounded-2xl font-black text-sm text-white flex items-center justify-center gap-2 transition-all"
          style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)', fontFamily: 'var(--font-display)' }}
        >
          <CheckCircle2 size={15} />
          Revisar y confirmar ({totalUds} uds)
        </button>
        <button
          onClick={() => { if (window.confirm('¿Descartar todos los artículos del lote?')) setLoteActual([]) }}
          className="w-full py-1.5 rounded-xl text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors"
        >
          Descartar lote
        </button>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 pb-24">
      <div className="max-w-5xl mx-auto px-4 pt-6 lg:flex lg:gap-6 lg:items-start">
        <div className="flex-1 lg:max-w-lg space-y-5 overflow-x-hidden">

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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Carga de stock</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué marca ingresó?</h2>
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué tipo de producto?</h2>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#4EC3BD' }}>{marca?.nombre}</p>
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
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Seleccioná el artículo</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{marca?.nombre}</h2>
              </div>
              <div className="space-y-3">
                {/* Búsqueda — siempre visible */}
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <Input value={busquedaProducto} onChange={e => setBusquedaProducto(e.target.value)} placeholder="Buscar producto..." className="h-9 pl-8 rounded-xl border-gray-200 text-sm" autoFocus />
                </div>
                {/* Productos agrupados por categoría */}
                {productosPorCategoria.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {productosPorCategoria.map(({ categoria, productos }) => (
                      <div key={categoria.id}>
                        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">{categoria.nombre}</p>
                        <div className="space-y-1">
                          {productos.map(p => {
                            const stockTotal = p.variantes.reduce((s, v) => s + v.stock, 0)
                            return (
                              <button key={p.id} onClick={() => seleccionarProducto(p)}
                                className="w-full flex justify-between items-center px-4 py-3 rounded-2xl border transition-all hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98]"
                                style={{ borderColor: '#e5e7eb', background: 'white' }}>
                                <span className="font-semibold text-sm text-gray-800 text-left">{p.nombre_base}</span>
                                <span className="text-xs font-medium ml-3 flex-shrink-0" style={{ color: stockTotal > 0 ? '#4EC3BD' : '#f97316' }}>{stockTotal} uds</span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                    {/* Productos sin categoría */}
                    {productosFiltrados.filter(p => !p.categoria_id).map(p => {
                      const stockTotal = p.variantes.reduce((s, v) => s + v.stock, 0)
                      return (
                        <button key={p.id} onClick={() => seleccionarProducto(p)}
                          className="w-full flex justify-between items-center px-4 py-3 rounded-2xl border transition-all hover:border-teal-300 hover:bg-teal-50 active:scale-[0.98]"
                          style={{ borderColor: '#e5e7eb', background: 'white' }}>
                          <span className="font-semibold text-sm text-gray-800 text-left">{p.nombre_base}</span>
                          <span className="text-xs font-medium ml-3 flex-shrink-0" style={{ color: stockTotal > 0 ? '#4EC3BD' : '#f97316' }}>{stockTotal} uds</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  busquedaProducto ? (
                    <p className="text-sm text-gray-400 text-center py-3">Sin resultados para "{busquedaProducto}"</p>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">Todavía no hay productos de {marca?.nombre}</p>
                  )
                )}
                <BtnAgregar label="Nuevo producto" onClick={seleccionarNuevoProducto} />
              </div>
            </div>
          </div>
        )}

        {/* ── PASO CATEGORIA ─────────────────────────────────────── */}
        {step === 'categoria' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Qué categoría?</h2>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#4EC3BD' }}>{marca?.nombre}</p>
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
                        {tiposDeEstaMarca.map(c => <Chip key={c.id} label={c.nombre} onClick={() => seleccionarCategoria(c)} />)}
                      </div>
                    </div>
                  )}
                  {otrosTipos.length > 0 && (
                    <details>
                      <summary className="text-xs text-gray-400 font-semibold cursor-pointer hover:text-gray-600">Otras categorías ({otrosTipos.length})</summary>
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        {otrosTipos.map(c => <Chip key={c.id} label={c.nombre} onClick={() => seleccionarCategoria(c)} />)}
                      </div>
                    </details>
                  )}
                  <BtnAgregar label="Nuevo tipo de producto" onClick={() => setModoCrear('tipo')} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PASO GENERO ─────────────────────────────────────────── */}
        {step === 'genero' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Para quién es?</h2>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#4EC3BD' }}>{marca?.nombre} · {tipo?.nombre}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'bebe', emoji: '👶', label: 'Bebé', sub: '0-24 meses' },
                  { key: 'nena', emoji: '👧', label: 'Nena', sub: 'Talle 2-16' },
                  { key: 'nene', emoji: '👦', label: 'Nene', sub: 'Talle 2-16' },
                  { key: 'unisex', emoji: '🤝', label: 'Unisex', sub: 'Talle 2-16' },
                ].map(({ key, emoji, label, sub }) => (
                  <button key={key}
                    onClick={() => { setGeneroSeleccionado(key as GeneroSeleccionado); irA('nombre_nuevo', 'forward') }}
                    className="flex flex-col items-center justify-center rounded-2xl border py-5 px-3 transition-all active:scale-95 hover:scale-[1.02]"
                    style={{
                      background: generoSeleccionado === key ? 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' : 'white',
                      borderColor: generoSeleccionado === key ? '#4EC3BD' : '#e5e7eb',
                      color: generoSeleccionado === key ? 'white' : '#374151',
                      boxShadow: generoSeleccionado === key ? '0 4px 12px rgba(78,195,189,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
                    }}>
                    <span className="text-2xl mb-1">{emoji}</span>
                    <span className="font-black text-sm">{label}</span>
                    <span className="text-[10px] opacity-70 mt-0.5">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── PASO NOMBRE_NUEVO: Constructor de nombre ───────────── */}
        {step === 'nombre_nuevo' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-5">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Nuevo producto · {tipo?.nombre}</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>
                  {modoLibre ? 'Escribí el nombre' : '¿Qué tipo de prenda?'}
                </h2>
                {modoLibre && (
                  <button
                    onClick={() => { setModoLibre(false); setNombreLibre('') }}
                    className="text-xs text-teal-600 hover:text-teal-700 underline mt-0.5"
                  >
                    ← Usar asistente de nombre
                  </button>
                )}
              </div>

              {/* Modo libre: input directo */}
              {modoLibre && (
                <div className="space-y-3">
                  <div className="px-3 py-2 rounded-xl text-xs font-medium" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                    ⚠ El nombre libre no sigue el formato estándar y puede generar inconsistencias.
                  </div>
                  <Input
                    value={nombreLibre}
                    onChange={e => setNombreLibre(e.target.value)}
                    placeholder="Ej: Remera Blanca San Miguel, Bikini verano..."
                    className="h-10 rounded-xl text-sm"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && nombreLibre.trim() && confirmarNombreLibre()}
                  />
                  <p className="text-xs text-teal-600 mt-1">💡 No incluyas el talle en el nombre — se elige en el paso siguiente</p>
                  {nombreLibre.trim() && (
                    <button
                      onClick={confirmarNombreLibre}
                      className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                      style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                    >
                      Continuar con &quot;{nombreLibre.trim()}&quot;
                    </button>
                  )}
                </div>
              )}

              {/* Modo asistente: cards de tipos ordenados por relevancia */}
              {!modoLibre && (
                <div className="grid grid-cols-3 gap-2">
                  {tiposOrdenados.map(t => {
                    const count = productosDeEstaMarcaYCat.filter(p =>
                      normalizar(p.nombre_base).startsWith(normalizar(t.nombre))
                    ).length
                    const activo = tipoPrendaObj?.id === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTipoPrendaObj(t)}
                        className="relative flex flex-col items-center justify-center rounded-2xl border py-4 px-2 transition-all active:scale-95 hover:scale-[1.02]"
                        style={{
                          background: activo ? 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' : 'white',
                          borderColor: activo ? '#4EC3BD' : '#e5e7eb',
                          color: activo ? 'white' : '#374151',
                          boxShadow: activo ? '0 4px 12px rgba(78,195,189,0.35)' : '0 1px 3px rgba(0,0,0,0.05)',
                        }}
                      >
                        {count > 0 && (
                          <span
                            className="absolute top-1.5 right-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none"
                            style={{
                              background: activo ? 'rgba(255,255,255,0.25)' : 'rgba(78,195,189,0.12)',
                              color: activo ? 'white' : '#0d9488',
                            }}
                          >{count}</span>
                        )}
                        <span className="text-sm font-bold text-center leading-tight">{t.nombre}</span>
                        <span className="text-[10px] font-mono mt-0.5" style={{ opacity: activo ? 0.7 : 0.4 }}>{t.abreviatura}</span>
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setModalTipoAbierto(true)}
                    className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed py-4 px-2 transition-all hover:border-teal-400"
                    style={{ borderColor: '#d1d5db', color: '#9ca3af', background: 'white' }}
                  >
                    <Plus size={16} style={{ color: '#9ca3af' }} />
                    <span className="text-xs font-semibold mt-1">Nuevo tipo</span>
                  </button>
                </div>
              )}

              {/* Detalle (chips con historial) */}
              {!modoLibre && builderTipoOk && (
                <div className="tk-slide-forward space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-gray-100" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Detalle</p>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {detallesDisponibles.map(d => (
                      <button
                        key={d}
                        onClick={() => setDetalleLibre(detalleLibre === d ? '' : d)}
                        className="py-1.5 px-3 rounded-2xl text-sm font-semibold border transition-all active:scale-95"
                        style={{
                          background: detalleLibre === d ? 'rgba(78,195,189,0.12)' : 'white',
                          borderColor: detalleLibre === d ? '#4EC3BD' : '#e5e7eb',
                          color: detalleLibre === d ? '#0d9488' : '#6b7280',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                    {!mostrarInputNuevoDetalle && (
                      <button
                        onClick={() => setMostrarInputNuevoDetalle(true)}
                        className="py-1.5 px-3 rounded-2xl text-sm font-semibold border border-dashed transition-all"
                        style={{ borderColor: '#d1d5db', color: '#9ca3af', background: 'white' }}
                      >
                        + Otro
                      </button>
                    )}
                  </div>
                  {mostrarInputNuevoDetalle && (
                    <div className="flex gap-2">
                      <Input
                        value={inputNuevoDetalle}
                        onChange={e => setInputNuevoDetalle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && inputNuevoDetalle.trim()) {
                            const cap = inputNuevoDetalle.trim().replace(/\b\w/g, c => c.toUpperCase())
                            if (tipoPrendaObj) guardarDetalleNuevo(tipoPrendaObj.id, cap)
                            setDetallesDisponibles(prev => prev.includes(cap) ? prev : [...prev, cap])
                            setDetalleLibre(cap)
                            setInputNuevoDetalle('')
                            setMostrarInputNuevoDetalle(false)
                          }
                          if (e.key === 'Escape') { setMostrarInputNuevoDetalle(false); setInputNuevoDetalle('') }
                        }}
                        placeholder="Escribí el detalle..."
                        className="h-9 rounded-xl border-gray-200 text-sm flex-1"
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (!inputNuevoDetalle.trim()) { setMostrarInputNuevoDetalle(false); return }
                          const cap = inputNuevoDetalle.trim().replace(/\b\w/g, c => c.toUpperCase())
                          if (tipoPrendaObj) guardarDetalleNuevo(tipoPrendaObj.id, cap)
                          setDetallesDisponibles(prev => prev.includes(cap) ? prev : [...prev, cap])
                          setDetalleLibre(cap)
                          setInputNuevoDetalle('')
                          setMostrarInputNuevoDetalle(false)
                        }}
                        className="px-4 py-2 rounded-xl text-white text-sm font-bold shrink-0"
                        style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
                      >
                        OK
                      </button>
                      <button
                        onClick={() => { setMostrarInputNuevoDetalle(false); setInputNuevoDetalle('') }}
                        className="px-3 py-2 rounded-xl border border-gray-200 text-gray-500 text-sm shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-teal-600">💡 No incluyas el talle — se elige en el paso siguiente</p>
                </div>
              )}

              {/* Colegio (solo si es Colegial) */}
              {!modoLibre && builderTipoOk && esColegial && (
                <div className="tk-slide-forward space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="h-px flex-1 bg-gray-100" />
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Colegio</p>
                    <div className="h-px flex-1 bg-gray-100" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colegios.map(c => (
                      <button key={c.id}
                        onClick={() => setColegioObj(colegioObj?.id === c.id ? null : c)}
                        className="py-1.5 px-3 rounded-2xl text-sm font-bold border transition-all active:scale-95"
                        style={{
                          background: colegioObj?.id === c.id ? 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' : 'white',
                          borderColor: colegioObj?.id === c.id ? '#4EC3BD' : '#e5e7eb',
                          color: colegioObj?.id === c.id ? 'white' : '#374151',
                        }}>
                        {c.nombre}
                      </button>
                    ))}
                    <button
                      onClick={() => setModalColegioAbierto(true)}
                      className="py-1.5 px-3 rounded-2xl text-sm font-bold border border-dashed"
                      style={{ borderColor: '#d1d5db', color: '#9ca3af', background: 'white' }}>
                      + Agregar colegio
                    </button>
                  </div>
                </div>
              )}

              {/* Preview del nombre + confirmar */}
              {!modoLibre && builderTipoOk && nombreGenerado && (
                <div className="tk-slide-forward space-y-3">
                  <div className="p-4 rounded-2xl text-center" style={{ background: '#f0fdfb', border: '1px solid rgba(78,195,189,0.25)' }}>
                    <p className="text-xs text-gray-400 mb-1">Nombre generado</p>
                    <p className="text-xl font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{nombreGenerado}</p>
                    <p className="text-[10px] text-gray-400 mt-1">Código: <span className="font-mono text-teal-600">{calcularPrefijoCodigo()}[talle]</span></p>
                  </div>
                  <button
                    onClick={confirmarNombre}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                  >
                    Continuar con &quot;{nombreGenerado}&quot;
                  </button>
                  <button
                    onClick={() => { setModoLibre(true); setTipoPrendaObj(null); setDetalleLibre('') }}
                    className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
                  >
                    ¿El nombre no cierra? → Modo avanzado
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
                    <Input type="number" value={precioCosto} onChange={e => handleCostoChange(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" autoFocus />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Venta</p>
                    <Input type="number" value={precioVenta} onChange={e => handleVentaChange(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" />
                    {!precioVentaEditado && precioVenta && precioCosto && (
                      <span className="inline-block mt-1 text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">sugerido x{MARGEN_SUGERIDO}</span>
                    )}
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

                {precioLista > 0 && (
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">Etiqueta</p>
                      <p className="text-sm font-bold text-gray-800">{formatPrecio(precioLista)}</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400">Efectivo (−20%)</p>
                      <p className="text-sm font-bold" style={{ color: '#0d9488' }}>{formatPrecio(precioEfectivo)}</p>
                    </div>
                  </div>
                )}

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

                {errorVentaMenorCosto && (
                  <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    ⛔ El precio de venta no puede ser menor al costo
                  </div>
                )}
                {advertenciaMargenBajo && (
                  <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: '#fff7ed', border: '1px solid #fed7aa', color: '#c2410c' }}>
                    ⚠ Margen muy bajo — ¿confirmás el precio?
                  </div>
                )}
                {advertenciaMargenAlto && (
                  <div className="px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                    ⚠ Margen muy alto ({margen}%) — ¿verificaste el precio?
                  </div>
                )}
                <button
                  onClick={() => irA('talle', 'forward')}
                  disabled={errorVentaMenorCosto}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                >
                  Siguiente → Elegir talle
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── PASO PRECIO_EXISTENTE ─────────────────────────────── */}
        {step === 'precio_existente' && producto && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">{marca?.nombre}</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>¿Cambió el precio?</h2>
                <p className="text-sm font-bold mt-0.5" style={{ color: '#4EC3BD' }}>
                  {producto.nombre_base}
                  {marca && <span className="font-normal text-gray-400"> — {marca.nombre}</span>}
                </p>
              </div>

              {/* Precio actual */}
              <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Precio actual</p>
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-gray-400">Costo</p>
                    <p className="text-sm font-bold text-gray-800">{formatPrecio(parseFloat(precioCosto) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Venta</p>
                    <p className="text-sm font-bold text-gray-800">{formatPrecio(parseFloat(precioVenta) || 0)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 pt-1 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400">Etiqueta</p>
                    <p className="text-sm font-semibold text-gray-700">{formatPrecio(parseFloat(precioVenta) || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Efectivo (−20%)</p>
                    <p className="text-sm font-semibold" style={{ color: '#0d9488' }}>{formatPrecio(Math.round((parseFloat(precioVenta) || 0) * 0.8))}</p>
                  </div>
                </div>
              </div>

              {!quiereCambiarPrecio ? (
                <div className="space-y-2">
                  <button
                    onClick={() => irA('talle', 'forward')}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                  >
                    Mantener precio → Elegir talle
                  </button>
                  <button
                    onClick={() => {
                      setQuiereCambiarPrecio(true)
                      setPrecioVentaEditado(false)
                    }}
                    className="w-full py-2.5 rounded-2xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  >
                    Actualizar precio
                  </button>
                </div>
              ) : (
                <div className="space-y-3 tk-slide-forward">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Costo nuevo</p>
                      <Input type="number" value={precioCosto} onChange={e => handleCostoChange(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" autoFocus />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Venta nueva</p>
                      <Input type="number" value={precioVenta} onChange={e => handleVentaChange(e.target.value)} placeholder="0" className="h-10 rounded-xl border-gray-200 text-sm" />
                      {!precioVentaEditado && precioVenta && precioCosto && (
                        <span className="inline-block mt-1 text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">sugerido x{MARGEN_SUGERIDO}</span>
                      )}
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

                  {precioLista > 0 && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">Etiqueta</p>
                        <p className="text-sm font-bold text-gray-800">{formatPrecio(precioLista)}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-gray-400">Efectivo (−20%)</p>
                        <p className="text-sm font-bold" style={{ color: '#0d9488' }}>{formatPrecio(precioEfectivo)}</p>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => irA('talle', 'forward')}
                    className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                  >
                    Guardar nuevo precio → Elegir talle
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PASO TALLE + CANTIDAD (unificado, multi-talle) ──── */}
        {step === 'talle' && (
          <div className={animClass}>
            <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Talles y cantidades</h2>
                <p className="text-xs text-gray-400 mt-0.5">Producto: <span className="font-medium text-gray-700">{esProductoNuevo ? nombreNuevoProducto : producto?.nombre_base}</span> — Tocá para seleccionar</p>
              </div>
              <div className="space-y-4">
                {/* Talles existentes (producto existente) */}
                {!esProductoNuevo && tallesExistentes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Talles en stock</p>
                    <div className="grid grid-cols-3 gap-2">
                      {tallesExistentes.map(v => (
                        <Chip key={v.id} label={v.talle} sub={tallesSeleccionados[v.talle] ? `✓ ×${tallesSeleccionados[v.talle].cantidad}` : `${v.stock} uds`}
                          activo={!!tallesSeleccionados[v.talle]}
                          onClick={() => toggleTalle(v.talle, v.id, false)} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Talles sugeridos / faltantes */}
                {(esProductoNuevo ? tallesSugeridos : tallesFaltantes).length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{esProductoNuevo ? 'Talles sugeridos' : 'Talles faltantes'}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {(esProductoNuevo ? tallesSugeridos : tallesFaltantes).map(t => (
                        <Chip key={t} label={t} sub={tallesSeleccionados[t] ? `✓ ×${tallesSeleccionados[t].cantidad}` : '+ nuevo'}
                          activo={!!tallesSeleccionados[t]}
                          onClick={() => toggleTalle(t, null, true)} />
                      ))}
                    </div>
                  </div>
                )}
                {/* Talle personalizado */}
                {modoCrear === 'talle' ? (
                  <InlineCrear placeholder="Ej: T3, 37, Único..." onConfirm={confirmarCrearTalle} onCancel={() => setModoCrear(null)} loading={loadingCrear} />
                ) : (
                  <BtnAgregar label="Talle personalizado" onClick={() => setModoCrear('talle')} />
                )}
              </div>

              {/* Detalle de talles seleccionados: cantidad + precio por talle */}
              {Object.keys(tallesSeleccionados).length > 0 && (
                <div className="space-y-3 pt-2 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Detalle por talle</p>
                  {Object.entries(tallesSeleccionados).map(([talle, sel]) => {
                    const talleMargen = sel.precioCosto && sel.precioVenta
                      ? (((parseFloat(sel.precioVenta) - parseFloat(sel.precioCosto)) / parseFloat(sel.precioCosto)) * 100).toFixed(0)
                      : null
                    return (
                      <div key={talle} className="rounded-xl px-3 py-3 space-y-2" style={{ background: 'rgba(78,195,189,0.05)', border: '1px solid rgba(78,195,189,0.15)' }}>
                        {/* Header: talle + cantidad + eliminar */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-gray-800 min-w-[3rem]">{talle}</span>
                          <div className="flex items-center gap-1.5 flex-1">
                            <button onClick={() => setCantidadTalle(talle, sel.cantidad - 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:border-teal-300 transition-all active:scale-90 bg-white">
                              <Minus size={12} className="text-gray-500" />
                            </button>
                            <input type="number" value={sel.cantidad}
                              onChange={e => setCantidadTalle(talle, parseInt(e.target.value) || 1)}
                              className="w-12 h-7 rounded-lg border text-center text-sm font-black text-gray-900 focus:outline-none focus:border-teal-400"
                              style={{ borderColor: '#e5e7eb' }} min={1} />
                            <button onClick={() => setCantidadTalle(talle, sel.cantidad + 1)}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center hover:border-teal-300 transition-all active:scale-90 bg-white">
                              <Plus size={12} className="text-gray-500" />
                            </button>
                            <span className="text-[10px] text-gray-400 ml-1">uds</span>
                          </div>
                          <button onClick={() => setTallesSeleccionados(prev => { const n = { ...prev }; delete n[talle]; return n })}
                            className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-50 transition-colors">
                            <X size={14} className="text-gray-400 hover:text-red-500" />
                          </button>
                        </div>
                        {/* Precios por talle */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-400 mb-0.5">Costo</p>
                            <input type="number" value={sel.precioCosto}
                              onChange={e => setPrecioTalle(talle, 'precioCosto', e.target.value)}
                              placeholder="0" className="w-full h-7 rounded-lg border text-xs text-center font-semibold text-gray-800 focus:outline-none focus:border-teal-400"
                              style={{ borderColor: '#e5e7eb' }} />
                          </div>
                          <div className="flex-1">
                            <p className="text-[10px] text-gray-400 mb-0.5">Venta</p>
                            <input type="number" value={sel.precioVenta}
                              onChange={e => setPrecioTalle(talle, 'precioVenta', e.target.value)}
                              placeholder="0" className="w-full h-7 rounded-lg border text-xs text-center font-semibold text-gray-800 focus:outline-none focus:border-teal-400"
                              style={{ borderColor: '#e5e7eb' }} />
                          </div>
                          {talleMargen !== null && (
                            <div className="w-12 text-center">
                              <p className="text-xs font-black leading-none" style={{ color: Number(talleMargen) >= 30 ? '#0d9488' : Number(talleMargen) >= 15 ? '#d97706' : '#ef4444' }}>{talleMargen}%</p>
                              <p className="text-[8px] text-gray-400">margen</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-xs text-gray-400">{Object.keys(tallesSeleccionados).length} talle{Object.keys(tallesSeleccionados).length > 1 ? 's' : ''}</span>
                    <span className="text-sm font-black" style={{ color: '#0d9488', fontFamily: 'var(--font-display)' }}>
                      Total: {Object.values(tallesSeleccionados).reduce((s, sel) => s + sel.cantidad, 0)} uds
                    </span>
                  </div>
                </div>
              )}

              {/* Botón agregar al lote */}
              {Object.keys(tallesSeleccionados).length > 0 && (
                <button onClick={agregarAlLote}
                  className="w-full py-4 rounded-2xl font-black text-base text-white transition-all hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 20px rgba(78,195,189,0.4)', fontFamily: 'var(--font-display)' }}>
                  <Plus size={20} />
                  Agregar al lote — {Object.values(tallesSeleccionados).reduce((s, sel) => s + sel.cantidad, 0)} uds en {Object.keys(tallesSeleccionados).length} talle{Object.keys(tallesSeleccionados).length > 1 ? 's' : ''}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── PASO REVISAR_LOTE ──────────────────────────────────── */}
        {step === 'revisar_lote' && (
          <div className={animClass}>
            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Revisión</p>
                <h2 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Revisá tu carga</h2>
                <p className="text-sm text-gray-400">Verificá todo antes de guardar</p>
              </div>

              {loteActual.length === 0 ? (
                <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center">
                  <p className="text-gray-400">El lote está vacío</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {loteActual.map(item => {
                    const catNombre = categorias.find(c => c.id === item.categoriaId)?.nombre
                    const totalUdsItem = Object.values(item.talles).reduce((s, sel) => s + sel.cantidad, 0)
                    const itemPrecioVenta = item.precioVenta
                    const itemPrecioCosto = item.precioCosto
                    const itemMargen = itemPrecioCosto > 0
                      ? Math.round(((itemPrecioVenta - itemPrecioCosto) / itemPrecioCosto) * 100)
                      : null
                    const itemEfectivo = Math.round(itemPrecioVenta * 0.8)

                    return (
                      <div key={item.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {/* Header del artículo */}
                        <div className="p-4 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={item.nombreProducto}
                                onChange={e => setLoteActual(prev => prev.map(it => it.id === item.id ? { ...it, nombreProducto: e.target.value } : it))}
                                className="w-full text-base font-black text-gray-900 border-0 border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none bg-transparent pb-0.5 transition-colors"
                                style={{ fontFamily: 'var(--font-display)' }}
                              />
                              <p className="text-xs text-gray-400 mt-0.5">
                                {[item.marcaNombre, catNombre].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                          {Object.values(item.talles)[0]?.barcode && (
                            <p className="text-[10px] font-mono text-teal-600">
                              Código base: {Object.values(item.talles)[0].barcode}
                            </p>
                          )}
                        </div>

                        {/* Precios */}
                        <div className="px-4 pb-3">
                          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.15)' }}>
                            <div className="flex-1">
                              <p className="text-[10px] text-gray-400">Costo</p>
                              <input
                                type="number"
                                value={item.precioCosto || ''}
                                onChange={e => setLoteActual(prev => prev.map(it => it.id === item.id ? { ...it, precioCosto: parseFloat(e.target.value) || 0 } : it))}
                                className="w-full text-sm font-bold text-gray-800 border-0 border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none bg-transparent transition-colors"
                                placeholder="0"
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-[10px] text-gray-400">Venta</p>
                              <input
                                type="number"
                                value={item.precioVenta || ''}
                                onChange={e => setLoteActual(prev => prev.map(it => it.id === item.id ? { ...it, precioVenta: parseFloat(e.target.value) || 0 } : it))}
                                className="w-full text-sm font-bold text-gray-800 border-0 border-b border-transparent hover:border-gray-200 focus:border-teal-400 focus:outline-none bg-transparent transition-colors"
                                placeholder="0"
                              />
                            </div>
                            <div className="text-center">
                              {itemMargen !== null ? (
                                <>
                                  <p className="text-sm font-black leading-none" style={{ color: itemMargen >= 30 ? '#0d9488' : itemMargen >= 15 ? '#d97706' : '#ef4444', fontFamily: 'var(--font-display)' }}>{itemMargen}%</p>
                                  <p className="text-[9px] text-gray-400">margen</p>
                                </>
                              ) : <p className="text-xs text-gray-300">%</p>}
                            </div>
                          </div>
                          {itemEfectivo > 0 && (
                            <p className="text-[10px] text-gray-400 mt-1.5 px-1">
                              Efectivo (−20%): <span className="font-semibold text-teal-600">{formatPrecio(itemEfectivo)}</span>
                            </p>
                          )}
                        </div>

                        {/* Tabla de talles */}
                        <div className="px-4 pb-3">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                            Talles cargados · {totalUdsItem} unidades
                          </p>
                          <div className="space-y-1.5">
                            {Object.entries(item.talles).map(([talle, sel]) => (
                              <div key={talle} className="flex items-center gap-2 py-1.5 px-2 rounded-lg" style={{ background: 'rgba(78,195,189,0.04)' }}>
                                <span className="text-xs font-black text-gray-800 w-8">{talle}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setLoteActual(prev => prev.map(it => {
                                      if (it.id !== item.id) return it
                                      const newTalles = { ...it.talles }
                                      newTalles[talle] = { ...newTalles[talle], cantidad: Math.max(1, sel.cantidad - 1) }
                                      return { ...it, talles: newTalles }
                                    }))}
                                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:border-teal-300 bg-white">
                                    <Minus size={10} className="text-gray-500" />
                                  </button>
                                  <span className="w-6 text-center text-xs font-black text-gray-900">{sel.cantidad}</span>
                                  <button
                                    onClick={() => setLoteActual(prev => prev.map(it => {
                                      if (it.id !== item.id) return it
                                      const newTalles = { ...it.talles }
                                      newTalles[talle] = { ...newTalles[talle], cantidad: sel.cantidad + 1 }
                                      return { ...it, talles: newTalles }
                                    }))}
                                    className="w-6 h-6 rounded-md border border-gray-200 flex items-center justify-center hover:border-teal-300 bg-white">
                                    <Plus size={10} className="text-gray-500" />
                                  </button>
                                </div>
                                <div className="flex-1 flex items-center gap-2 text-[10px] text-gray-500">
                                  <span>C: {formatPrecio(parseFloat(sel.precioCosto) || item.precioCosto)}</span>
                                  <span>V: {formatPrecio(parseFloat(sel.precioVenta) || item.precioVenta)}</span>
                                  {sel.barcode && <span className="font-mono text-teal-600 truncate">{sel.barcode}</span>}
                                </div>
                                <button
                                  onClick={() => setLoteActual(prev => prev.map(it => {
                                    if (it.id !== item.id) return it
                                    const newTalles = { ...it.talles }
                                    delete newTalles[talle]
                                    return { ...it, talles: newTalles }
                                  }).filter(it => it.id !== item.id || Object.keys(it.talles).length > 0))}
                                  className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50">
                                  <Trash2 size={10} className="text-gray-300 hover:text-red-400" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Eliminar artículo completo */}
                        <div className="px-4 pb-4">
                          <button
                            onClick={() => eliminarDelLote(item.id)}
                            className="w-full py-2 rounded-xl text-xs font-semibold text-red-400 hover:text-red-500 hover:bg-red-50 transition-colors border border-transparent hover:border-red-100">
                            Eliminar artículo
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Acciones */}
              <div className="space-y-3">
                <button
                  onClick={confirmarLote}
                  disabled={loadingConfirmar || loteActual.length === 0}
                  className="w-full py-4 rounded-2xl font-black text-base text-white flex items-center justify-center gap-2 disabled:opacity-75 transition-all"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)', fontFamily: 'var(--font-display)' }}>
                  {loadingConfirmar ? (
                    <><Loader2 size={18} className="animate-spin" /> {confirmProgress ? `Guardando ${confirmProgress.current}/${confirmProgress.total}...` : 'Guardando...'}</>
                  ) : (
                    <><CheckCircle2 size={18} /> Confirmar y guardar ({loteActual.reduce((s, i) => s + Object.values(i.talles).reduce((ss, sel) => ss + sel.cantidad, 0), 0)} uds)</>
                  )}
                </button>
                <button
                  onClick={empezarDeNuevo}
                  className="w-full py-3 rounded-2xl font-semibold text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  ← Seguir cargando
                </button>
              </div>
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
                <p className="text-xs font-bold mt-1" style={{ color: '#4EC3BD' }}>
                  {productosCargados.length} artículo{productosCargados.length !== 1 ? 's' : ''} · {productosCargados.reduce((s, p) => s + p.talles.reduce((ss, t) => ss + t.cantidad, 0), 0)} unidades esta sesión
                </p>
              </div>
              <div className="rounded-2xl p-4 text-left space-y-2" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.2)' }}>
                <div className="flex justify-between"><span className="text-xs text-gray-500">{ultimoGuardado.nombre.includes('artículo') ? 'Lote' : 'Producto'}</span><span className="text-sm font-bold text-gray-800">{ultimoGuardado.nombre}</span></div>
                {ultimoGuardado.talle && <div className="flex justify-between"><span className="text-xs text-gray-500">Talles</span><span className="text-xs font-semibold text-gray-700">{ultimoGuardado.talle}</span></div>}
                <div className="flex justify-between"><span className="text-xs text-gray-500">Unidades guardadas</span><span className="text-sm font-black" style={{ color: '#4EC3BD', fontFamily: 'var(--font-display)' }}>+{ultimoGuardado.cantidad}</span></div>
              </div>

              {/* Lista acumulada de la sesión */}
              {productosCargados.length > 0 && (
                <details className="text-left">
                  <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 flex items-center gap-1.5">
                    <Tag size={12} /> Ver detalle ({productosCargados.length} productos, {productosCargados.reduce((s, p) => s + p.talles.reduce((ss, t) => ss + t.cantidad, 0), 0)} uds)
                  </summary>
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {productosCargados.map((p, i) => {
                      const uds = p.talles.reduce((s, t) => s + t.cantidad, 0)
                      return (
                        <div key={i} className="flex items-center justify-between px-3 py-2 rounded-xl" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.1)' }}>
                          <div>
                            <p className="text-xs font-semibold text-gray-800">{p.nombre}</p>
                            {p.marca && <p className="text-[10px] text-gray-400">{p.marca}</p>}
                          </div>
                          <span className="text-xs font-bold" style={{ color: '#0d9488' }}>{uds} uds</span>
                        </div>
                      )
                    })}
                  </div>
                </details>
              )}

              <div className="space-y-2">
                <button onClick={empezarDeNuevo}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}>
                  Cargar más artículos
                </button>
                {productosCargados.length > 0 && (
                  <button onClick={() => setModalFinAbierto(true)}
                    className="w-full py-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95"
                    style={{ background: 'rgba(78,195,189,0.1)', color: '#0d9488', border: '2px solid rgba(78,195,189,0.3)' }}>
                    <Tag size={16} /> Generar etiquetas
                  </button>
                )}
                <button onClick={() => router.push('/inventario')} className="w-full py-2.5 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors">
                  <Package size={14} /> Ver inventario
                </button>
              </div>
            </div>
          </div>
        )}

        </div>

        {/* Desktop sidebar panel */}
        {loteActual.length > 0 && (
          <div className="hidden lg:block w-72 flex-shrink-0 sticky top-6">
            <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
              {renderPanelLote()}
            </div>
          </div>
        )}
      </div>

      {/* Mobile panel — barra fija sobre el nav */}
      {loteActual.length > 0 && (
        <div className="lg:hidden fixed bottom-16 left-0 right-0 z-40">
          {panelLoteExpandido ? (
            <div className="bg-white shadow-2xl rounded-t-3xl border-t border-gray-100 max-h-[70vh] overflow-y-auto">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Lote de carga</span>
                  <button onClick={() => setPanelLoteExpandido(false)} className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                    <ChevronUp size={14} className="text-gray-500 rotate-180" />
                  </button>
                </div>
                {renderPanelLote()}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setPanelLoteExpandido(true)}
              className="w-full flex items-center justify-between px-5 py-3 text-white"
              style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
            >
              <div className="flex items-center gap-2">
                <Package size={16} />
                <span className="text-sm font-bold">
                  {loteActual.length} artículo{loteActual.length > 1 ? 's' : ''} · {loteActual.reduce((s, item) => s + Object.values(item.talles).reduce((ss, sel) => ss + sel.cantidad, 0), 0)} uds
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold opacity-80">Revisar</span>
                <ChevronUp size={14} />
              </div>
            </button>
          )}
        </div>
      )}

      {/* ── MODAL ETIQUETAS FINAL ────────────────────────────────── */}
      {modalFinAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalFinAbierto(false) }}
        >
          <div className="bg-white rounded-3xl w-full max-w-md overflow-hidden shadow-2xl tk-slide-forward max-h-[90vh] flex flex-col">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Resumen de carga</h3>
              <button onClick={() => setModalFinAbierto(false)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>

            <div className="px-5 pb-5 space-y-4 overflow-y-auto flex-1">
              {/* Tabla resumen */}
              <div className="space-y-2">
                {productosCargados.map((p, i) => (
                  <div key={i} className="rounded-xl p-3 space-y-1" style={{ background: '#f8fdfc', border: '1px solid rgba(78,195,189,0.15)' }}>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-gray-800">{p.nombre}</p>
                      {p.marca && <span className="text-[10px] text-gray-400">{p.marca}</span>}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {p.talles.map((t, j) => (
                        <span key={j} className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(78,195,189,0.1)', color: '#0d9488' }}>
                          {t.talle} x{t.cantidad}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* Totales */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-gray-50 border border-gray-100">
                <span className="text-xs text-gray-500">{productosCargados.length} producto{productosCargados.length > 1 ? 's' : ''}</span>
                <span className="text-sm font-black" style={{ color: '#0d9488', fontFamily: 'var(--font-display)' }}>
                  {productosCargados.reduce((s, p) => s + p.talles.reduce((ss, t) => ss + t.cantidad, 0), 0)} etiquetas
                </span>
              </div>

              {/* WhatsApp input */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-gray-50">
                <Phone size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  value={telefonoWA}
                  onChange={e => { setTelefonoWA(e.target.value); setWhatsAppTel(e.target.value) }}
                  placeholder="Nro WhatsApp etiquetas"
                  className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder:text-gray-400"
                />
              </div>

              {/* Botones */}
              <div className="space-y-2">
                <button
                  onClick={async () => {
                    setGenerandoPDF(true)
                    try {
                      const items: EtiquetaData[] = productosCargados.flatMap(p =>
                        p.talles.flatMap(t =>
                          Array(t.cantidad).fill(null).map(() => ({
                            nombre: p.nombre,
                            marca: p.marca,
                            talle: t.talle,
                            codigoBarras: t.codigoBarras,
                            precioLista: t.precioVenta,
                            precioEfectivo: Math.round(t.precioVenta * 0.8),
                          }))
                        )
                      )
                      await generarPDFEtiquetas(items)
                      toast.success('PDF descargado')
                    } catch (err) {
                      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
                    } finally {
                      setGenerandoPDF(false)
                    }
                  }}
                  disabled={generandoPDF}
                  className="w-full py-3 rounded-2xl font-bold text-sm text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)', boxShadow: '0 4px 14px rgba(78,195,189,0.3)' }}
                >
                  <FileDown size={16} /> {generandoPDF ? 'Generando...' : 'Generar PDF'}
                </button>
                <button
                  onClick={async () => {
                    if (!telefonoWA.trim()) { toast.error('Ingresá el número de WhatsApp'); return }
                    setWhatsAppTel(telefonoWA.trim())
                    setGenerandoPDF(true)
                    try {
                      const items: EtiquetaData[] = productosCargados.flatMap(p =>
                        p.talles.flatMap(t =>
                          Array(t.cantidad).fill(null).map(() => ({
                            nombre: p.nombre,
                            marca: p.marca,
                            talle: t.talle,
                            codigoBarras: t.codigoBarras,
                            precioLista: t.precioVenta,
                            precioEfectivo: Math.round(t.precioVenta * 0.8),
                          }))
                        )
                      )
                      const blob = await generarPDFEtiquetas(items)
                      const fecha = new Date().toISOString().slice(0, 10)
                      await compartirPDFWhatsApp(blob, `etiquetas_${fecha}.pdf`, telefonoWA.trim())
                    } catch (err) {
                      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
                    } finally {
                      setGenerandoPDF(false)
                    }
                  }}
                  disabled={generandoPDF}
                  className="w-full py-3 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50"
                  style={{ background: 'rgba(34,197,94,0.1)', color: '#15803d', border: '2px solid rgba(34,197,94,0.3)' }}
                >
                  <MessageCircle size={16} /> Enviar por WhatsApp
                </button>
                <button
                  onClick={() => setModalFinAbierto(false)}
                  className="w-full py-2.5 rounded-2xl font-medium text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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


      {/* ── MODAL TIPO DE PRENDA ─────────────────────────────────── */}
      {modalTipoAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalTipoAbierto(false) }}
        >
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl tk-slide-forward">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Nuevo tipo de prenda</h3>
              <button onClick={() => setModalTipoAbierto(false)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>
            <div className="px-5 pb-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Nombre</p>
                <Input
                  value={nuevoTipoNombre}
                  onChange={e => {
                    const nombre = e.target.value
                    setNuevoTipoNombre(nombre)
                    if (!nuevoTipoAbrevManual) {
                      const sug = nombre.trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 3)
                      setNuevoTipoAbrev(sug)
                    }
                  }}
                  placeholder="Ej: Remera Sin Manga"
                  className="h-10 rounded-xl border-gray-200 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Abreviatura (3-4 letras)</p>
                <Input
                  value={nuevoTipoAbrev}
                  onChange={e => {
                    setNuevoTipoAbrevManual(true)
                    setNuevoTipoAbrev(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))
                  }}
                  placeholder="Ej: RSM"
                  className="h-10 rounded-xl border-gray-200 text-sm font-mono"
                  maxLength={4}
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  {nuevoTipoAbrev
                    ? <>Barcode preview: <span className="font-mono text-teal-600">{nuevoTipoAbrev}[cat][marca][talle]</span></>
                    : 'Se sugiere automáticamente al escribir el nombre'}
                </p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setModalTipoAbierto(false); setNuevoTipoNombre(''); setNuevoTipoAbrev(''); setNuevoTipoAbrevManual(false) }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarCrearTipoPrenda}
                  disabled={loadingNuevoTipo || !nuevoTipoNombre.trim() || nuevoTipoAbrev.length < 2}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
                >
                  {loadingNuevoTipo ? '...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL COLEGIO ────────────────────────────────────────── */}
      {modalColegioAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
          onClick={e => { if (e.target === e.currentTarget) setModalColegioAbierto(false) }}
        >
          <div className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl tk-slide-forward">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>Nuevo colegio</h3>
              <button onClick={() => setModalColegioAbierto(false)} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors">
                <X size={14} className="text-gray-500" />
              </button>
            </div>
            <div className="px-5 pb-5 space-y-3">
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Nombre</p>
                <Input
                  value={nuevoColegioNombre}
                  onChange={e => setNuevoColegioNombre(e.target.value)}
                  placeholder="Ej: San José"
                  className="h-10 rounded-xl border-gray-200 text-sm"
                  autoFocus
                />
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1.5">Abreviatura (3-4 letras)</p>
                <Input
                  value={nuevoColegioAbrev}
                  onChange={e => setNuevoColegioAbrev(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                  placeholder="Ej: SJO"
                  className="h-10 rounded-xl border-gray-200 text-sm font-mono"
                  maxLength={4}
                />
                <p className="text-[10px] text-gray-400 mt-1">Se usa en el código de barras</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setModalColegioAbierto(false); setNuevoColegioNombre(''); setNuevoColegioAbrev('') }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium text-sm hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmarCrearColegio}
                  disabled={loadingNuevoColegio || !nuevoColegioNombre.trim() || nuevoColegioAbrev.length < 2}
                  className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #4EC3BD 0%, #0d9488 100%)' }}
                >
                  {loadingNuevoColegio ? '...' : 'Crear'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
