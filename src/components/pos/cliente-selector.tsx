'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Cliente } from '@/types'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, X, Users, AlertTriangle } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

interface Props {
  onSeleccionar: (c: Cliente) => void
  onCerrar: () => void
}

export default function ClienteSelector({ onSeleccionar, onCerrar }: Props) {
  const supabase = createClient()
  const [busqueda, setBusqueda] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const timer = setTimeout(buscar, 200)
    return () => clearTimeout(timer)
  }, [busqueda])

  async function buscar() {
    let query = supabase.from('clientes').select('*').eq('activo', true).order('nombre').limit(30)
    if (busqueda.trim()) query = query.ilike('nombre', `%${busqueda}%`)
    const { data } = await query
    setClientes(data || [])
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-16 px-4">
      <div className="bg-white rounded-xl w-full max-w-md shadow-2xl max-h-[60vh] flex flex-col">
        <div className="p-4 border-b border-gray-100 flex items-center gap-3">
          <Search size={18} className="text-gray-400" />
          <Input
            ref={inputRef}
            placeholder="Buscar cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="border-0 shadow-none focus-visible:ring-0 text-base p-0 h-auto"
          />
          <button onClick={onCerrar} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1 divide-y divide-gray-50">
          {clientes.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Users size={32} className="mx-auto mb-2" />
              <p className="text-sm">No se encontraron clientes</p>
            </div>
          )}
          {clientes.map(c => (
            <button
              key={c.id}
              onClick={() => onSeleccionar(c)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-pink-50 transition-colors text-left"
            >
              <div>
                <p className="font-medium text-gray-800 text-sm">{c.nombre}</p>
                {c.telefono && <p className="text-xs text-gray-500">{c.telefono}</p>}
              </div>
              {c.deuda_total > 0 && (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <AlertTriangle size={10} /> {formatPrecio(c.deuda_total)}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
