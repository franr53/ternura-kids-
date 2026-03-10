'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Producto, Categoria, Proveedor } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Search, Package, AlertTriangle, TrendingUp, Filter
} from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

export default function InventarioPage() {
  const supabase = createClient()
  const [productos, setProductos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('todas')
  const [filtroProveedor, setFiltroProveedor] = useState('todos')
  const [filtroStock, setFiltroStock] = useState('todos')

  const cargarDatos = useCallback(async () => {
    setLoading(true)
    const [{ data: prods }, { data: cats }, { data: provs }] = await Promise.all([
      supabase
        .from('productos')
        .select(`*, categoria:categorias(*), proveedor:proveedores(*), variantes(*)`)
        .eq('activo', true)
        .order('nombre'),
      supabase.from('categorias').select('*').eq('activa', true).order('nombre'),
      supabase.from('proveedores').select('*').eq('activo', true).order('nombre'),
    ])
    setProductos(prods || [])
    setCategorias(cats || [])
    setProveedores(provs || [])
    setLoading(false)
  }, [supabase])

  useEffect(() => { cargarDatos() }, [cargarDatos])

  const productosFiltrados = productos.filter(p => {
    const matchBusqueda = busqueda === '' ||
      p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.variantes?.some(v => v.codigo_barras?.includes(busqueda))
    const matchCategoria = filtroCategoria === 'todas' || p.categoria_id === filtroCategoria
    const matchProveedor = filtroProveedor === 'todos' || p.proveedor_id === filtroProveedor
    const stockTotal = p.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0
    const matchStock =
      filtroStock === 'todos' ? true :
      filtroStock === 'sin_stock' ? stockTotal === 0 :
      filtroStock === 'stock_bajo' ? stockTotal > 0 && p.variantes?.some(v => v.stock <= v.stock_minimo) :
      true
    return matchBusqueda && matchCategoria && matchProveedor && matchStock
  })

  // Stats
  const totalProductos = productos.length
  const sinStock = productos.filter(p => (p.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0) === 0).length
  const stockBajo = productos.filter(p => p.variantes?.some(v => v.stock > 0 && v.stock <= v.stock_minimo)).length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Inventario</h1>
          <p className="text-gray-500 text-sm mt-0.5">{totalProductos} productos activos</p>
        </div>
        <Link href="/inventario/nuevo">
          <Button className="bg-pink-500 hover:bg-pink-600 gap-2">
            <Plus size={18} /> Nuevo producto
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Package size={20} className="text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{totalProductos}</p>
                <p className="text-xs text-gray-500">Total productos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle size={20} className="text-red-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{sinStock}</p>
                <p className="text-xs text-gray-500">Sin stock</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><TrendingUp size={20} className="text-orange-500" /></div>
              <div>
                <p className="text-2xl font-bold text-gray-800">{stockBajo}</p>
                <p className="text-xs text-gray-500">Stock bajo</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Buscar por nombre o código de barras..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filtroCategoria} onValueChange={v => setFiltroCategoria(v ?? 'todas')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas las categorías</SelectItem>
            {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroProveedor} onValueChange={v => setFiltroProveedor(v ?? 'todos')}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Proveedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los proveedores</SelectItem>
            {proveedores.map(p => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filtroStock} onValueChange={v => setFiltroStock(v ?? 'todos')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Stock" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todo el stock</SelectItem>
            <SelectItem value="sin_stock">Sin stock</SelectItem>
            <SelectItem value="stock_bajo">Stock bajo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Cargando...</div>
        ) : productosFiltrados.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">No hay productos que coincidan</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Producto</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Categoría</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Proveedor</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Precio venta</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Stock total</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Talles</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {productosFiltrados.map(producto => {
                const stockTotal = producto.variantes?.reduce((s, v) => s + v.stock, 0) ?? 0
                const sinStock = stockTotal === 0
                const stockBajo = !sinStock && producto.variantes?.some(v => v.stock > 0 && v.stock <= v.stock_minimo)
                return (
                  <tr key={producto.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {(sinStock || stockBajo) && (
                          <AlertTriangle size={14} className={sinStock ? 'text-red-400' : 'text-orange-400'} />
                        )}
                        <span className="font-medium text-gray-800">{producto.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {producto.categoria ? (
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                          style={{ backgroundColor: producto.categoria.color }}
                        >
                          {producto.categoria.nombre}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{producto.proveedor?.nombre ?? '—'}</td>
                    <td className="px-4 py-3 text-right font-medium text-gray-800">
                      {formatPrecio(producto.precio_venta)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={sinStock ? 'destructive' : stockBajo ? 'outline' : 'secondary'}>
                        {stockTotal}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs">
                      {producto.variantes?.length ?? 0} talles
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link href={`/inventario/${producto.id}`}>
                        <Button variant="ghost" size="sm" className="text-pink-600 hover:text-pink-700">
                          Ver
                        </Button>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
