'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Upload, Check, AlertCircle, Package, Users, Tag, Zap } from 'lucide-react'

interface VarianteImport { talle: string; codigo: string | null; stock: number }
interface ProductoImport {
  nombre: string; proveedor: string; categoria: string
  precio_costo: number; precio_venta: number; variantes: VarianteImport[]
}
interface ImportData {
  proveedores: string[]
  categorias: string[]
  productos: ProductoImport[]
}

interface Progreso {
  fase: string
  actual: number
  total: number
  errores: string[]
}

export default function ImportarPage() {
  const supabase = createClient()
  const [data, setData] = useState<ImportData | null>(null)
  const [importando, setImportando] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [completado, setCompletado] = useState<{ productos: number; variantes: number; proveedores: number } | null>(null)

  // Cargar datos pre-procesados de Contagram
  async function cargarDatosPreprocesados() {
    try {
      const res = await fetch('/contagram_parsed.json')
      if (!res.ok) throw new Error('Archivo no encontrado')
      const json: ImportData = await res.json()
      setData(json)
      toast.success(`Datos listos: ${json.productos.length} productos de ${json.proveedores.length} proveedores`)
    } catch {
      toast.error('No se pudo cargar el archivo preprocesado')
    }
  }

  // Cargar CSV manualmente
  function cargarCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const parsed = parsearCSV(text)
      setData(parsed)
      toast.success(`CSV cargado: ${parsed.productos.length} productos`)
    }
    reader.readAsText(file, 'latin1')
  }

  function parsearCSV(text: string): ImportData {
    const CAT_MAP: Record<string, string> = {
      'NIÑA': 'Niñas', 'NIÑO': 'Niños', 'BEBÉ': 'Bebé', 'BEBE': 'Bebé',
      'COLEGIAL': 'Niños', 'Calzado ': 'Calzado Nena', 'Calzado': 'Calzado Nena',
      'Ropa interior ': 'Ropa Interior', 'Ropa interior': 'Ropa Interior',
      'Perfumeria': 'Accesorios', 'ACCESORIOS': 'Accesorios', '': 'Accesorios',
    }

    function extraerTalle(nombre: string, catRaw: string): [string, string] {
      const m = nombre.match(/\s[Tt](\w+)$/)
      if (m) return [nombre.slice(0, m.index).trim(), m[1]]
      if (catRaw.includes('Calzado')) {
        const m2 = nombre.match(/(\d{2})$/)
        if (m2) return [nombre.slice(0, m2.index).replace(/[-_\s]+$/, ''), m2[1]]
      }
      return [nombre.trim(), 'U']
    }

    const lines = text.split('\n').filter(Boolean)
    const grupos = new Map<string, ProductoImport>()
    const provs = new Set<string>()

    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';')
      if (cols.length < 9) continue
      const [, nombre, catRaw, provRaw, codigo, stockStr, costoStr, , ventaStr] = cols
      const cat = CAT_MAP[catRaw?.trim()] || 'Accesorios'
      const prov = (provRaw?.trim() && provRaw.trim() !== '-') ? provRaw.trim() : ''
      if (prov) provs.add(prov)
      const [base, talle] = extraerTalle(nombre?.trim() || '', catRaw || '')
      const key = `${base}||${prov}||${cat}`
      const stock = Math.max(0, parseInt(stockStr) || 0)
      const costo = parseFloat(costoStr) || 0
      const venta = parseFloat(ventaStr) || 0

      if (!grupos.has(key)) {
        grupos.set(key, { nombre: base, proveedor: prov, categoria: cat, precio_costo: costo, precio_venta: venta, variantes: [] })
      }
      const g = grupos.get(key)!
      g.variantes.push({ talle, codigo: codigo?.trim() || null, stock })
      if (costo > g.precio_costo) g.precio_costo = costo
      if (venta > g.precio_venta) g.precio_venta = venta
    }

    const categorias = [...new Set([...grupos.values()].map(p => p.categoria))].sort()
    return { proveedores: [...provs].sort(), categorias, productos: [...grupos.values()] }
  }

  async function importar() {
    if (!data) return
    setImportando(true)
    setCompletado(null)
    const errores: string[] = []

    // 1. Traer categorías existentes
    setProgreso({ fase: 'Cargando categorías...', actual: 0, total: 1, errores })
    const { data: catsExistentes } = await supabase.from('categorias').select('id, nombre')
    const catMap = new Map((catsExistentes || []).map(c => [c.nombre, c.id]))

    // 2. Importar proveedores
    setProgreso({ fase: 'Importando proveedores...', actual: 0, total: data.proveedores.length, errores })
    const { data: provsExistentes } = await supabase.from('proveedores').select('id, nombre')
    const provMap = new Map((provsExistentes || []).map(p => [p.nombre, p.id]))

    const provsNuevos = data.proveedores.filter(p => !provMap.has(p))
    if (provsNuevos.length > 0) {
      const { data: inserted } = await supabase
        .from('proveedores')
        .insert(provsNuevos.map(nombre => ({ nombre })))
        .select('id, nombre')
      inserted?.forEach(p => provMap.set(p.nombre, p.id))
    }

    // 3. Importar productos en lotes
    let productosCreados = 0
    let variantesCreadas = 0
    const LOTE = 20

    for (let i = 0; i < data.productos.length; i += LOTE) {
      const lote = data.productos.slice(i, i + LOTE)
      setProgreso({ fase: 'Importando productos...', actual: i, total: data.productos.length, errores })

      const { data: prods, error } = await supabase
        .from('productos')
        .insert(lote.map(p => ({
          nombre: p.nombre,
          categoria_id: catMap.get(p.categoria) || null,
          proveedor_id: p.proveedor ? provMap.get(p.proveedor) || null : null,
          precio_costo: p.precio_costo,
          precio_venta: p.precio_venta,
        })))
        .select('id')

      if (error || !prods) {
        errores.push(`Error en lote ${i / LOTE + 1}: ${error?.message}`)
        continue
      }
      productosCreados += prods.length

      // Variantes del lote
      const variantes = prods.flatMap((prod, idx) =>
        lote[idx].variantes.map(v => ({
          producto_id: prod.id,
          talle: v.talle,
          codigo_barras: v.codigo || null,
          stock: v.stock,
          stock_minimo: 2,
        }))
      )

      if (variantes.length > 0) {
        const { data: vars } = await supabase.from('variantes').insert(variantes).select('id')
        variantesCreadas += vars?.length || 0
      }
    }

    setProgreso({ fase: 'Completado', actual: data.productos.length, total: data.productos.length, errores })
    setImportando(false)
    setCompletado({ productos: productosCreados, variantes: variantesCreadas, proveedores: provsNuevos.length })
    toast.success(`¡Importación completa! ${productosCreados} productos, ${variantesCreadas} variantes`)
  }

  const pct = progreso ? Math.round((progreso.actual / progreso.total) * 100) : 0

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Importar desde Contagram</h1>
        <p className="text-gray-500 text-sm mt-1">Cargá el CSV exportado de Contagram para importar todos tus productos</p>
      </div>

      {/* Paso 1 */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center font-bold">1</span> Cargar datos</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={cargarDatosPreprocesados} className="w-full bg-teal-500 hover:bg-teal-600 gap-2">
            <Zap size={16} /> Usar datos pre-procesados de Contagram (recomendado)
          </Button>
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center text-xs text-gray-400 bg-white px-2 w-fit mx-auto">o subí el CSV manualmente</div>
          </div>
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors">
            <Upload size={20} className="text-gray-400 mb-1" />
            <span className="text-sm text-gray-500">Seleccionar archivo CSV</span>
            <input type="file" accept=".csv" className="hidden" onChange={cargarCSV} />
          </label>
        </CardContent>
      </Card>

      {/* Preview */}
      {data && !completado && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><span className="w-6 h-6 rounded-full bg-teal-500 text-white text-xs flex items-center justify-center font-bold">2</span> Previsualización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <Package size={24} className="mx-auto text-blue-500 mb-1" />
                <p className="text-2xl font-bold text-gray-800">{data.productos.length}</p>
                <p className="text-xs text-gray-500">Productos</p>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <Tag size={24} className="mx-auto text-purple-500 mb-1" />
                <p className="text-2xl font-bold text-gray-800">{data.productos.reduce((s, p) => s + p.variantes.length, 0)}</p>
                <p className="text-xs text-gray-500">Variantes (talles)</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <Users size={24} className="mx-auto text-green-500 mb-1" />
                <p className="text-2xl font-bold text-gray-800">{data.proveedores.length}</p>
                <p className="text-xs text-gray-500">Proveedores</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Categorías a importar:</p>
              <div className="flex flex-wrap gap-2">
                {data.categorias.map(c => <Badge key={c} variant="outline">{c}</Badge>)}
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-medium mb-2">Primeros 5 productos:</p>
              <div className="space-y-1">
                {data.productos.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50">
                    <div>
                      <span className="font-medium text-gray-700">{p.nombre}</span>
                      <span className="text-gray-400 ml-2 text-xs">{p.proveedor || 'Sin proveedor'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{p.variantes.length} talles</Badge>
                      <span className="text-xs text-gray-500">{p.categoria}</span>
                    </div>
                  </div>
                ))}
                {data.productos.length > 5 && (
                  <p className="text-xs text-gray-400 text-center pt-1">... y {data.productos.length - 5} más</p>
                )}
              </div>
            </div>

            <Button onClick={importar} disabled={importando} className="w-full bg-teal-500 hover:bg-teal-600 h-12 text-base gap-2">
              <Upload size={18} /> Importar {data.productos.length} productos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progreso */}
      {importando && progreso && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <p className="text-sm font-medium text-gray-700">{progreso.fase}</p>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div className="bg-teal-500 h-3 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-gray-500 text-center">{progreso.actual} / {progreso.total} ({pct}%)</p>
            {progreso.errores.length > 0 && (
              <div className="bg-red-50 rounded-lg p-3 space-y-1">
                {progreso.errores.map((e, i) => (
                  <p key={i} className="text-xs text-red-600 flex items-center gap-1"><AlertCircle size={12} />{e}</p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Completado */}
      {completado && (
        <Card className="border-green-200">
          <CardContent className="pt-6">
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <Check size={32} className="text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800">¡Importación exitosa!</h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{completado.productos}</p>
                  <p className="text-xs text-gray-500">Productos</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{completado.variantes}</p>
                  <p className="text-xs text-gray-500">Variantes</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-600">{completado.proveedores}</p>
                  <p className="text-xs text-gray-500">Proveedores nuevos</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">Ya podés ver tus productos en el Inventario</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
