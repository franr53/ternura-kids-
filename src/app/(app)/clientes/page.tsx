'use client'

import { Suspense, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Cliente } from '@/types'
import { useCache } from '@/lib/hooks/use-cache'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, Users, AlertCircle, MessageCircle, FileSpreadsheet, ChevronRight } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'
import { usePrivacyMode } from '@/lib/hooks/use-privacy-mode'

function InicialAvatar({ nombre, size = 'sm' }: { nombre: string; size?: 'sm' | 'md' }) {
  const iniciales = nombre.trim().split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  const colores = [
    ['#ccfbf1', '#0d9488'], ['#d1fae5', '#059669'], ['#dbeafe', '#2563eb'],
    ['#ede9fe', '#7c3aed'], ['#fce7f3', '#db2777'], ['#ffedd5', '#ea580c'],
  ]
  const idx = nombre.charCodeAt(0) % colores.length
  const [bg, text] = colores[idx]
  const sz = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-semibold shrink-0`} style={{ backgroundColor: bg, color: text }}>
      {iniciales}
    </div>
  )
}

export default function ClientesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Cargando...</div>}>
      <ClientesContent />
    </Suspense>
  )
}

function ClientesContent() {
  const supabase = createClient()
  const { mask } = usePrivacyMode()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { data: _clientes, loading } = useCache<Cliente[]>('cli:lista', async () => {
    const { data } = await supabase.from('clientes').select('*').eq('activo', true).order('nombre')
    return data || []
  })
  const clientes = _clientes ?? []
  const [busqueda, setBusqueda] = useState('')
  const filtroInicial = searchParams.get('filtro') === 'con_deuda' ? 'con_deuda' : 'todos'
  const [filtro, setFiltro] = useState<'todos' | 'con_deuda'>(filtroInicial)

  const clientesFiltrados = clientes.filter(c => {
    const matchBusqueda = !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || c.telefono?.includes(busqueda)
    const matchFiltro = filtro === 'todos' || (filtro === 'con_deuda' && c.deuda_total > 0)
    return matchBusqueda && matchFiltro
  })

  const totalDeuda = clientes.reduce((s, c) => s + c.deuda_total, 0)
  const conDeuda = clientes.filter(c => c.deuda_total > 0).length

  function abrirWhatsApp(telefono: string, nombre: string) {
    const tel = telefono.replace(/\D/g, '')
    const url = `https://wa.me/54${tel}?text=${encodeURIComponent(`Hola ${nombre}! Te contactamos desde Ternura Kids.`)}`
    window.open(url, '_blank')
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
          <p className="text-gray-500 text-sm">{clientes.length} clientes registrados</p>
        </div>
        <div className="flex gap-2">
          <Link href="/clientes/importar">
            <Button variant="outline" className="gap-2 border-teal-200 text-teal-700 hover:bg-teal-50">
              <FileSpreadsheet size={16} /> Importar Excel
            </Button>
          </Link>
          <Link href="/clientes/nuevo">
            <Button className="bg-teal-500 hover:bg-teal-600 gap-2">
              <Plus size={16} /> Nuevo cliente
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-2.5 rounded-xl" style={{ background: 'linear-gradient(135deg, #ccfbf1, #99f6e4)' }}>
            <Users size={20} className="text-teal-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-800">{conDeuda}</p>
            <p className="text-xs text-gray-500">Clientes con fiado</p>
          </div>
        </div>
        <div className="rounded-xl p-4 flex items-center gap-4" style={{ background: 'linear-gradient(135deg, #4EC3BD, #0d9488)' }}>
          <div className="p-2.5 rounded-xl bg-white/20">
            <AlertCircle size={20} className="text-white" />
          </div>
          <div>
            <p className="text-2xl font-bold text-white">{mask(formatPrecio(totalDeuda))}</p>
            <p className="text-xs text-teal-100">Deuda total acumulada</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o teléfono..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          {(['todos', 'con_deuda'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                filtro === f
                  ? 'bg-teal-500 text-white'
                  : 'text-gray-600 hover:bg-white'
              }`}
            >
              {f === 'todos' ? 'Todos' : `Con fiado (${conDeuda})`}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Cargando clientes...</p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay clientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Teléfono</th>
                <th className="text-left px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Dirección</th>
                <th className="text-right px-4 py-3 text-gray-500 font-medium text-xs uppercase tracking-wide">Fiado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientesFiltrados.map(cliente => (
                <tr key={cliente.id} onClick={() => router.push(`/clientes/${cliente.id}`)} className="hover:bg-gray-50 transition-colors group cursor-pointer">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <InicialAvatar nombre={cliente.nombre} />
                      <span className="font-medium text-gray-800">{cliente.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{cliente.telefono || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{cliente.direccion || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {cliente.deuda_total > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-600 border border-red-100">
                        {mask(formatPrecio(cliente.deuda_total))}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-teal-50 text-teal-600 border border-teal-100">
                        Al día
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      {cliente.telefono && (
                        <button
                          onClick={(e) => { e.stopPropagation(); abrirWhatsApp(cliente.telefono!, cliente.nombre) }}
                          className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                          title="WhatsApp"
                        >
                          <MessageCircle size={15} />
                        </button>
                      )}
                      <Link href={`/clientes/${cliente.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1 text-teal-600 hover:text-teal-700 text-xs font-medium px-2 py-1 rounded-lg hover:bg-teal-50 transition-colors">
                        Ver <ChevronRight size={13} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
