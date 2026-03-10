'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Cliente } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, Users, AlertTriangle, MessageCircle } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

export default function ClientesPage() {
  const supabase = createClient()
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtro, setFiltro] = useState<'todos' | 'con_deuda'>('todos')

  const cargar = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase.from('clientes').select('*').eq('activo', true).order('nombre')
    setClientes(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { cargar() }, [cargar])

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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Clientes</h1>
          <p className="text-gray-500 text-sm">{clientes.length} clientes registrados</p>
        </div>
        <Link href="/clientes/nuevo">
          <Button className="bg-pink-500 hover:bg-pink-600 gap-2">
            <Plus size={18} /> Nuevo cliente
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg"><Users size={20} className="text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{conDeuda}</p>
                <p className="text-xs text-gray-500">Clientes con fiado</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle size={20} className="text-red-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{formatPrecio(totalDeuda)}</p>
                <p className="text-xs text-gray-500">Deuda total acumulada</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Buscar por nombre o teléfono..." value={busqueda} onChange={e => setBusqueda(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {(['todos', 'con_deuda'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFiltro(f)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${filtro === f ? 'bg-pink-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              {f === 'todos' ? 'Todos' : 'Con fiado'}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay clientes</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Cliente</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Dirección</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Deuda (fiado)</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clientesFiltrados.map(cliente => (
                <tr key={cliente.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{cliente.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{cliente.telefono || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{cliente.direccion || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {cliente.deuda_total > 0 ? (
                      <Badge variant="destructive">{formatPrecio(cliente.deuda_total)}</Badge>
                    ) : (
                      <Badge variant="secondary">Sin deuda</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {cliente.telefono && (
                        <button
                          onClick={() => abrirWhatsApp(cliente.telefono!, cliente.nombre)}
                          className="p-1.5 text-green-500 hover:bg-green-50 rounded-lg"
                          title="WhatsApp"
                        >
                          <MessageCircle size={16} />
                        </button>
                      )}
                      <Link href={`/clientes/${cliente.id}`}>
                        <Button variant="ghost" size="sm" className="text-pink-600 hover:text-pink-700">Ver</Button>
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
