'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCache } from '@/lib/hooks/use-cache'
import { Variante, Producto } from '@/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, X, Package } from 'lucide-react'
import { formatPrecio, formatNombreConTalle } from '@/lib/utils'

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
  return fuzzyMatch(v.producto.nombre_base, q)
}

export default function BuscadorProducto({ onSeleccionar, onCerrar }: Props) {
  const supabase = createClient()
  const [busqueda, setBusqueda] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const { data: _variantes, loading } = useCache<VarianteConProducto[]>('pos:variantes', async () => {
    const { data } = await supabase
      .from('variantes')
      .select('*, producto:productos(*, categoria:categorias(nombre, color))')
      .order('talle')
      .limit(500)
    return ((data || []).filter(v => v.producto?.activo) as VarianteConProducto[])
  })
  const todasVariantes = _variantes ?? []

  useEffect(() => { inputRef.current?.focus() }, [])

  const resultados = busqueda.trim()
    ? todasVariantes.filter(v => matchVariante(v, busqueda))
    : []

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-xl w-full max-w-xl shadow-2xl max-h-[70vh] flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <Search size={18} className="text-gray-400" />
          <Input
            ref={inputRef}
            placeholder="Buscar producto..."
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
          {!loading && busqueda.trim() && resultados.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">No se encontraron productos para &ldquo;{busqueda}&rdquo;</p>
            </div>
          )}
          {!loading && resultados.length > 0 && (
            <div className="divide-y divide-gray-50">
              {resultados.map(variante => (
                <button
                  key={variante.id}
                  onClick={() => { onSeleccionar(variante); onCerrar() }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-teal-50 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{formatNombreConTalle(variante.producto.nombre_base, variante.talle)}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {variante.producto.categoria && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full text-white"
                          style={{ backgroundColor: variante.producto.categoria.color }}
                        >
                          {variante.producto.categoria.nombre}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="font-semibold text-gray-800 text-sm">{formatPrecio(variante.precio_venta)}</p>
                    {variante.stock <= 0 ? (
                      <Badge className="text-xs bg-orange-500 hover:bg-orange-500">⚠ Sin stock</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">Stock: {variante.stock}</Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
