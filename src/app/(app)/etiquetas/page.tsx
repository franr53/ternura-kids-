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
import { Search, Trash2, FileDown, MessageCircle, Phone } from 'lucide-react'
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
  variante: Variante & { produto?: ProductoConMarca }
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
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoConMarca | null>(null)
  const [filtroTalle, setFiltroTalle] = useState('')
  const [telefono, setTelefono] = useState('')
  const [generandoPDF, setGenerandoPDF] = useState(false)

  // Persist etiquetas to sessionStorage
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

  const filtrados = busqueda
    ? productos.filter(p =>
        normalizar(busqueda).split(/\s+/).filter(Boolean).every(w => normalizar(p.nombre_base).includes(w))
      )
    : []

  function agregarVariante(variante: Variante, producto: ProductoConMarca) {
    const existe = etiquetas.find(e => e.variante_id === variante.id)
    if (existe) return
    setEtiquetas(prev => [...prev, {
      variante_id: variante.id,
      variante: { ...variante, producto },
      cantidad: Math.max(1, variante.stock),
    }])
    setBusqueda('')
    setProductoSeleccionado(null)
  }

  function actualizarCantidad(varianteId: string, cantidad: number) {
    setEtiquetas(prev => prev.map(e =>
      e.variante_id === varianteId ? { ...e, cantidad: Math.max(1, cantidad) } : e
    ))
  }

  function eliminarEtiqueta(varianteId: string) {
    setEtiquetas(prev => prev.filter(e => e.variante_id !== varianteId))
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

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
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

      {/* Buscador - div instead of Card to avoid overflow-hidden cutting dropdown */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-6 pt-5 pb-2">
          <h3 className="text-base font-semibold">Agregar producto</h3>
        </div>
        <div className="px-6 pb-5">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Buscar producto por nombre..."
                value={productoSeleccionado ? productoSeleccionado.nombre_base : busqueda}
                onChange={e => { setBusqueda(e.target.value); setProductoSeleccionado(null) }}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Talle"
              value={filtroTalle}
              onChange={e => setFiltroTalle(e.target.value)}
              className="w-20 text-center"
            />
          </div>
          {filtrados.length > 0 && !productoSeleccionado && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto mt-1">
              {filtrados.map(producto => {
                const variantesFiltradas = filtroTalle.trim()
                  ? producto.variantes?.filter(v => v.talle.toLowerCase().includes(filtroTalle.trim().toLowerCase()))
                  : producto.variantes
                if (!variantesFiltradas || variantesFiltradas.length === 0) return null
                return (
                  <div key={producto.id}>
                    <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex justify-between">
                      <span>{producto.nombre_base}</span>
                      {producto.marca?.nombre && (
                        <span className="text-gray-400">{producto.marca.nombre}</span>
                      )}
                    </div>
                    {variantesFiltradas.map(v => (
                      <button
                        key={v.id}
                        className="w-full text-left px-6 py-2 hover:bg-teal-50 text-sm border-b border-gray-50 last:border-0 flex justify-between items-center"
                        onClick={() => agregarVariante(v, producto)}
                      >
                        <span>
                          T{v.talle}
                          <span className="text-gray-400 ml-2">(stock: {v.stock})</span>
                          {v.codigo_barras && <span className="text-gray-400 font-mono ml-2 text-xs">{v.codigo_barras}</span>}
                        </span>
                        <span className="font-medium text-gray-700">{formatPrecio(v.precio_venta)}</span>
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Lista de etiquetas */}
      {etiquetas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lista de etiquetas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {etiquetas.map(e => (
                <div key={e.variante_id} className="flex items-center gap-4 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{formatNombreConTalle(e.variante.producto?.nombre_base || '', e.variante.talle)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {e.variante.producto?.marca?.nombre && (
                        <span className="text-xs text-gray-400">{e.variante.producto.marca.nombre}</span>
                      )}
                      <span className="text-sm text-gray-500">
                        {formatPrecio(e.variante.precio_venta)}
                        <span className="text-xs text-gray-400 ml-1">
                          · ef. {formatPrecio(Math.round((e.variante.precio_venta) * 0.8))}
                        </span>
                      </span>
                      {e.variante.codigo_barras && (
                        <span className="text-xs text-gray-400 font-mono">{e.variante.codigo_barras}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500">Cant:</Label>
                    <Input
                      type="number"
                      value={e.cantidad}
                      onChange={ev => actualizarCantidad(e.variante_id, parseInt(ev.target.value) || 1)}
                      className="w-20 text-center"
                      min="1"
                    />
                  </div>
                  <button onClick={() => eliminarEtiqueta(e.variante_id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-gray-500 text-sm">Total etiquetas a generar</span>
              <Badge className="bg-teal-500">{totalEtiquetas}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {etiquetas.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <FileDown size={48} className="mx-auto mb-3 opacity-30" />
          <p>Buscá un producto y seleccioná el talle para agregar etiquetas</p>
        </div>
      )}
    </div>
  )
}
