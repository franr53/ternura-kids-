'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Producto, Variante } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Trash2, FileDown, MessageCircle, Phone, Plus, Check } from 'lucide-react'
import { formatPrecio, formatNombreConTalle } from '@/lib/utils'
import { toast } from 'sonner'
import {
  type EtiquetaData,
  generarPDFEtiquetas,
  compartirPDFWhatsApp,
  getWhatsAppTel,
  setWhatsAppTel,
} from '@/lib/etiquetas-pdf'

type ProductoConMarca = Producto & {
  variantes?: Variante[]
  marca?: { nombre: string } | null
}

interface EtiquetaItem {
  variante_id: string
  variante: Variante & { producto?: ProductoConMarca }
  cantidad: number
}

export default function EtiquetasPage() {
  const supabase = createClient()
  const { data: _productos } = useCache<ProductoConMarca[]>('etiq:prods', async () => {
    const { data } = await supabase
      .from('productos')
      .select('*, variantes(*), marca:marcas(nombre)')
      .eq('activo', true)
      .order('nombre_base')
    return (data || []) as ProductoConMarca[]
  })
  const productos = _productos ?? []

  const [busqueda, setBusqueda] = useState('')
  const [etiquetas, setEtiquetas] = useState<EtiquetaItem[]>(() => {
    try {
      const saved = sessionStorage.getItem('etiq:seleccion')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [telefono, setTelefono] = useState('')
  const [generandoPDF, setGenerandoPDF] = useState(false)

  useEffect(() => {
    try {
      if (etiquetas.length > 0) {
        sessionStorage.setItem('etiq:seleccion', JSON.stringify(etiquetas))
      } else {
        sessionStorage.removeItem('etiq:seleccion')
      }
    } catch { /* ignore */ }
  }, [etiquetas])

  useEffect(() => {
    setTelefono(getWhatsAppTel())
  }, [])

  function normalizar(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean)
  const filtrados = productos.filter(p => {
    if (palabras.length === 0) return true
    const texto = normalizar(`${p.nombre_base} ${p.marca?.nombre ?? ''}`)
    return palabras.every(w => texto.includes(w))
  })

  function agregarVariante(variante: Variante, producto: ProductoConMarca) {
    const existe = etiquetas.find(e => e.variante_id === variante.id)
    if (existe) {
      setEtiquetas(prev => prev.filter(e => e.variante_id !== variante.id))
      return
    }
    setEtiquetas(prev => [...prev, {
      variante_id: variante.id,
      variante: { ...variante, producto },
      cantidad: Math.max(1, variante.stock),
    }])
  }

  function actualizarCantidad(varianteId: string, cantidad: number) {
    setEtiquetas(prev => prev.map(e =>
      e.variante_id === varianteId ? { ...e, cantidad: Math.max(1, cantidad) } : e
    ))
  }

  function eliminarEtiqueta(varianteId: string) {
    setEtiquetas(prev => prev.filter(e => e.variante_id !== varianteId))
  }

  function agregarTodosProducto(producto: ProductoConMarca) {
    const variantes = producto.variantes ?? []
    let agregados = 0
    setEtiquetas(prev => {
      const nuevas = [...prev]
      for (const v of variantes) {
        if (!nuevas.find(e => e.variante_id === v.id)) {
          nuevas.push({ variante_id: v.id, variante: { ...v, producto }, cantidad: Math.max(1, v.stock) })
          agregados++
        }
      }
      return nuevas
    })
    if (agregados > 0) toast.success(`${agregados} variante${agregados > 1 ? 's' : ''} agregada${agregados > 1 ? 's' : ''}`)
  }

  function buildEtiquetaDataList(): EtiquetaData[] {
    const result: EtiquetaData[] = []
    etiquetas.forEach(e => {
      const producto = e.variante.producto
      const precioLista = e.variante.precio_venta
      const precioEfectivo = Math.round(precioLista * 0.8)
      for (let i = 0; i < e.cantidad; i++) {
        result.push({
          nombre: producto?.nombre_base || '',
          marca: producto?.marca?.nombre || '',
          talle: e.variante.talle,
          codigoBarras: e.variante.codigo_barras || undefined,
          precioLista,
          precioEfectivo,
        })
      }
    })
    return result
  }

  async function handleGenerarPDF() {
    if (etiquetas.length === 0) return
    setGenerandoPDF(true)
    try {
      await generarPDFEtiquetas(buildEtiquetaDataList())
      toast.success('PDF descargado')
    } catch (err) {
      toast.error(`Error al generar PDF: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerandoPDF(false)
    }
  }

  async function handleWhatsApp() {
    if (!telefono.trim()) {
      toast.error('Ingresá el número de WhatsApp primero')
      return
    }
    setWhatsAppTel(telefono.trim())
    setGenerandoPDF(true)
    try {
      const blob = await generarPDFEtiquetas(buildEtiquetaDataList())
      const fecha = new Date().toISOString().slice(0, 10)
      const resultado = await compartirPDFWhatsApp(blob, `etiquetas_${fecha}.pdf`, telefono.trim())
      toast.success(resultado === 'shared' ? 'Etiquetas compartidas' : 'PDF descargado — adjuntalo en el chat de WhatsApp')
    } catch (err) {
      toast.error(`Error al compartir: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setGenerandoPDF(false)
    }
  }

  function handleTelefonoChange(val: string) {
    setTelefono(val)
    setWhatsAppTel(val)
  }

  const totalEtiquetas = etiquetas.reduce((s, e) => s + e.cantidad, 0)
  const variantesSeleccionadas = new Set(etiquetas.map(e => e.variante_id))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Etiquetas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Generá etiquetas de precio en PDF</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-gray-50 rounded-lg px-2 py-1 border border-gray-200">
            <Phone size={14} className="text-gray-400" />
            <Input
              value={telefono}
              onChange={e => handleTelefonoChange(e.target.value)}
              placeholder="Nro WhatsApp"
              className="h-7 w-32 text-xs border-0 bg-transparent p-0 focus-visible:ring-0"
            />
          </div>
          <Button
            onClick={handleGenerarPDF}
            disabled={etiquetas.length === 0 || generandoPDF}
            className="bg-teal-500 hover:bg-teal-600 gap-2"
          >
            <FileDown size={18} /> {generandoPDF ? 'Generando...' : `Generar PDF (${totalEtiquetas})`}
          </Button>
          <Button
            onClick={handleWhatsApp}
            disabled={etiquetas.length === 0 || generandoPDF}
            variant="outline"
            className="gap-2 border-green-300 text-green-700 hover:bg-green-50"
          >
            <MessageCircle size={18} /> WhatsApp
          </Button>
        </div>
      </div>

      {/* Buscador + lista de productos */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar por nombre o marca..."
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              className="pl-9"
              autoComplete="off"
            />
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {filtrados.length} producto{filtrados.length !== 1 ? 's' : ''} — hacé clic en un talle para agregar
          </p>
        </div>

        <div className="divide-y divide-gray-50 max-h-[420px] overflow-y-auto">
          {filtrados.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-10">Sin resultados para &ldquo;{busqueda}&rdquo;</p>
          )}
          {filtrados.map(producto => {
            const variantes = producto.variantes ?? []
            const todasSeleccionadas = variantes.length > 0 && variantes.every(v => variantesSeleccionadas.has(v.id))
            return (
              <div key={producto.id} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-800 text-sm">{producto.nombre_base}</span>
                    {producto.marca?.nombre && (
                      <Badge variant="outline" className="text-xs font-normal text-gray-500 border-gray-200">
                        {producto.marca.nombre}
                      </Badge>
                    )}
                  </div>
                  <button
                    onClick={() => agregarTodosProducto(producto)}
                    disabled={todasSeleccionadas}
                    className="text-xs text-teal-600 hover:text-teal-700 disabled:text-gray-300 disabled:cursor-default flex items-center gap-1 transition-colors"
                  >
                    <Plus size={12} /> Todos
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {variantes.map(v => {
                    const seleccionada = variantesSeleccionadas.has(v.id)
                    return (
                      <button
                        key={v.id}
                        onClick={() => agregarVariante(v, producto)}
                        className={`
                          inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border transition-all
                          ${seleccionada
                            ? 'bg-teal-50 border-teal-300 text-teal-700 hover:bg-red-50 hover:border-red-300 hover:text-red-500'
                            : 'bg-white border-gray-200 text-gray-700 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700'
                          }
                        `}
                      >
                        {seleccionada && <Check size={10} />}
                        T{v.talle}
                        <span className={`${seleccionada ? 'text-teal-500' : 'text-gray-400'}`}>
                          {formatPrecio(v.precio_venta)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lista de etiquetas seleccionadas */}
      {etiquetas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Etiquetas a imprimir</CardTitle>
              <Badge className="bg-teal-500">{totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {etiquetas.map(e => (
                <div key={e.variante_id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">
                      {formatNombreConTalle(e.variante.producto?.nombre_base || '', e.variante.talle)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {e.variante.producto?.marca?.nombre && (
                        <span className="text-xs text-gray-400">{e.variante.producto.marca.nombre}</span>
                      )}
                      <span className="text-xs text-gray-500">
                        {formatPrecio(e.variante.precio_venta)}
                      </span>
                      {e.variante.codigo_barras && (
                        <span className="text-xs text-gray-300 font-mono">{e.variante.codigo_barras}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Label className="text-xs text-gray-400">Cant:</Label>
                    <Input
                      type="number"
                      value={e.cantidad}
                      onChange={ev => actualizarCantidad(e.variante_id, parseInt(ev.target.value) || 1)}
                      className="w-16 text-center text-sm h-8"
                      min="1"
                    />
                  </div>
                  <button onClick={() => eliminarEtiqueta(e.variante_id)} className="text-red-300 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {etiquetas.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <FileDown size={40} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Seleccioná talles arriba para agregar etiquetas</p>
        </div>
      )}
    </div>
  )
}
