'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Variante, Producto } from '@/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, X, Package, ChevronDown, ChevronUp } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

type VarianteConProducto = Variante & { producto: Producto & { categoria?: { nombre: string; color: string } } }

interface Props {
  onSeleccionar: (v: VarianteConProducto) => void
  onCerrar: () => void
}

function normalizar(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function fuzzyMatch(texto: string, query: string): boolean {
  const t = normalizar(texto)
  return normalizar(query).split(/\s+/).filter(Boolean).every(w => t.includes(w))
}

function matchVariante(v: VarianteConProducto, query: string): boolean {
  const q = query.trim()
  if (v.codigo_barras && v.codigo_barras.includes(q)) return true
  // Incluir talle en el texto para poder buscar "Baiker 6" o "remera M"
  return fuzzyMatch(`${v.producto.nombre_base} ${v.talle}`, q)
}

function sortVariantes(variantes: VarianteConProducto[]): VarianteConProducto[] {
  return [...variantes].sort((a, b) => {
    const na = Number(a.talle)
    const nb = Number(b.talle)
    const aNum = !isNaN(na)
    const bNum = !isNaN(nb)
    if (aNum && bNum) return na - nb
    if (aNum) return -1
    if (bNum) return 1
    return a.talle.localeCompare(b.talle)
  })
}

function formatTalle(talle: string): string {
  return /^\d+$/.test(talle) ? `T${talle}` : talle
}

export default function BuscadorProducto({ onSeleccionar, onCerrar }: Props) {
  const supabase = createClient()
  const [busqueda, setBusqueda] = useState('')
  const [productoExpandido, setProductoExpandido] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: _variantes, loading } = useCache<VarianteConProducto[]>('pos:variantes:v3', async () => {
    const { data } = await supabase
      .from('variantes')
      .select('*, producto:productos(*, categoria:categorias(nombre, color))')
      .order('talle')
      .limit(5000)
    return ((data || []).filter(v => v.producto?.activo === true) as VarianteConProducto[])
  })
  const todasVariantes = _variantes ?? []

  useEffect(() => { inputRef.current?.focus() }, [])

  // Reset expanded product when search changes
  useEffect(() => { setProductoExpandido(null) }, [busqueda])

  const resultados = busqueda.trim()
    ? todasVariantes.filter(v => matchVariante(v, busqueda))
    : []

  // Group results by producto_id
  const productosResultados = useMemo(() => {
    const map = new Map<string, VarianteConProducto[]>()
    resultados.forEach(v => {
      if (!map.has(v.producto_id)) map.set(v.producto_id, [])
      map.get(v.producto_id)!.push(v)
    })
    // Sort variantes within each group
    const entries = Array.from(map.entries()).map(([id, variantes]) => ({
      producto_id: id,
      variantes: sortVariantes(variantes),
    }))
    return entries
  }, [resultados])

  function handleSeleccionarVariante(v: VarianteConProducto) {
    onSeleccionar(v)
    onCerrar()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 px-4" onClick={onCerrar}>
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <Search size={18} className="text-gray-400" />
          <Input
            ref={inputRef}
            placeholder="Buscar por nombre, talle o código..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && busqueda.trim()) {
                const exacto = todasVariantes.find(v => v.codigo_barras === busqueda.trim())
                if (exacto) { onSeleccionar(exacto); onCerrar(); return }
                if (resultados.length === 1) { onSeleccionar(resultados[0]); onCerrar() }
              }
            }}
            className="border-0 shadow-none focus-visible:ring-0 text-base p-0 h-auto"
          />
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <div className="p-8 text-center text-gray-400 text-sm">Cargando productos...</div>}
          {!loading && !busqueda.trim() && (
            <div className="p-8 text-center text-gray-400">
              <Search size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Escribí el nombre del producto</p>
            </div>
          )}
          {!loading && busqueda.trim() && productosResultados.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">No se encontraron productos para &ldquo;{busqueda}&rdquo;</p>
            </div>
          )}
          {!loading && productosResultados.length > 0 && (
            <div className="divide-y divide-gray-50">
              {productosResultados.map(grupo => {
                const { producto_id, variantes } = grupo
                const primera = variantes[0]
                const producto = primera.producto
                const expandido = productoExpandido === producto_id
                const stockTotal = variantes.reduce((acc, v) => acc + v.stock, 0)
                const sinStock = stockTotal <= 0

                return (
                  <div key={producto_id}>
                    {/* Product row */}
                    <button
                      onClick={() => setProductoExpandido(prev => prev === producto_id ? null : producto_id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-teal-50 transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">{producto.nombre_base}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {producto.categoria && (
                            <span
                              className="text-xs px-1.5 py-0.5 rounded-full text-white"
                              style={{ backgroundColor: producto.categoria.color }}
                            >
                              {producto.categoria.nombre}
                            </span>
                          )}
                          {variantes.length > 1 && (
                            <span className="text-xs text-gray-400">{variantes.length} talles</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-3 shrink-0">
                        {sinStock ? (
                          <Badge className="text-xs bg-orange-500 hover:bg-orange-500">⚠ Sin stock</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Stock: {stockTotal}</Badge>
                        )}
                        <span className="text-gray-400">
                          {expandido ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </div>
                    </button>

                    {/* Talle picker */}
                    {expandido && (
                      <div className="px-4 pb-3 flex flex-wrap gap-2 bg-gray-50">
                        {variantes.map(v => (
                          <button
                            key={v.id}
                            onClick={() => handleSeleccionarVariante(v)}
                            className="bg-gray-100 hover:bg-teal-50 rounded px-3 py-2 text-sm flex flex-col items-center transition-colors"
                          >
                            <span className="font-medium text-gray-800">{formatTalle(v.talle)}</span>
                            <span className="text-xs text-teal-600 font-medium">{formatPrecio(v.precio_venta)}</span>
                            {v.stock <= 0 ? (
                              <span className="text-xs text-orange-500">⚠ sin stock</span>
                            ) : (
                              <span className="text-xs text-gray-400">x{v.stock}</span>
                            )}
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
    </div>
  )
}
