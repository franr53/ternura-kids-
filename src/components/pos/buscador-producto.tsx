'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Variante, Producto } from '@/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, X, Package } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

type VarianteConProducto = Variante & { producto: Producto & { categoria?: { nombre: string; color: string } } }

interface Props {
  onSeleccionar: (v: VarianteConProducto) => void
  onCerrar: () => void
}

export default function BuscadorProducto({ onSeleccionar, onCerrar }: Props) {
  const supabase = createClient()
  const [busqueda, setBusqueda] = useState('')
  const [resultados, setResultados] = useState<VarianteConProducto[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    if (!busqueda.trim()) { setResultados([]); return }
    const timer = setTimeout(buscar, 300)
    return () => clearTimeout(timer)
  }, [busqueda])

  async function buscar() {
    setLoading(true)
    const { data } = await supabase
      .from('variantes')
      .select(`*, producto:productos(*, categoria:categorias(nombre, color))`)
      .eq('producto.activo', true)
      .ilike('producto.nombre', `%${busqueda}%`)
      .order('talle')
      .limit(50)

    setResultados((data || []).filter(v => v.producto) as VarianteConProducto[])
    setLoading(false)
  }

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
            className="border-0 shadow-none focus-visible:ring-0 text-base p-0 h-auto"
          />
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <div className="p-8 text-center text-gray-400 text-sm">Buscando...</div>}
          {!loading && busqueda && resultados.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Package size={32} className="mx-auto mb-2" />
              <p className="text-sm">No se encontraron productos</p>
            </div>
          )}
          {!loading && resultados.length > 0 && (
            <div className="divide-y divide-gray-50">
              {resultados.map(variante => (
                <button
                  key={variante.id}
                  onClick={() => { onSeleccionar(variante); onCerrar() }}
                  disabled={variante.stock <= 0}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-pink-50 transition-colors text-left disabled:opacity-40"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 text-sm truncate">{variante.producto.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500">Talle {variante.talle}</span>
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
                    <p className="font-semibold text-gray-800 text-sm">{formatPrecio(variante.producto.precio_venta)}</p>
                    <Badge variant={variante.stock <= 0 ? 'destructive' : 'secondary'} className="text-xs">
                      Stock: {variante.stock}
                    </Badge>
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
