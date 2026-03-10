'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Proveedor } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Plus, Search, Truck, DollarSign } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

export default function ProveedoresPage() {
  const supabase = createClient()
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('proveedores')
      .select('*')
      .eq('activo', true)
      .order('nombre')
    setProveedores(data || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const filtrados = proveedores.filter(p =>
    busqueda === '' || p.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  const totalDeuda = proveedores.reduce((s, p) => s + (p.deuda_total || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Proveedores</h1>
          <p className="text-gray-500 text-sm mt-0.5">{proveedores.length} proveedores activos</p>
        </div>
        <Link href="/proveedores/nuevo">
          <Button className="bg-pink-500 hover:bg-pink-600 gap-2">
            <Plus size={18} /> Nuevo proveedor
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Truck size={20} className="text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{proveedores.length}</p>
                <p className="text-xs text-gray-500">Total proveedores</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><DollarSign size={20} className="text-red-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{formatPrecio(totalDeuda)}</p>
                <p className="text-xs text-gray-500">Deuda total</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Búsqueda */}
      <div className="relative max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Buscar proveedor..."
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay proveedores</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Teléfono</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Deuda</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(prov => (
                <tr key={prov.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{prov.nombre}</td>
                  <td className="px-4 py-3 text-gray-600">{prov.telefono || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{prov.email || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {prov.deuda_total > 0 ? (
                      <Badge variant="destructive">{formatPrecio(prov.deuda_total)}</Badge>
                    ) : (
                      <Badge variant="secondary">Sin deuda</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link href={`/proveedores/${prov.id}`}>
                      <Button variant="ghost" size="sm" className="text-pink-600 hover:text-pink-700">Ver</Button>
                    </Link>
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
