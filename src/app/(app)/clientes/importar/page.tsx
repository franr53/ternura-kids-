'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Upload, CheckCircle, AlertTriangle, FileSpreadsheet, X } from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface FilaExcel {
  [key: string]: string | number | null
}

interface MapeoColumnas {
  nombre: string
  telefono: string
  direccion: string
  deuda_total: string
}

interface ClientePreview {
  nombre: string
  telefono: string
  direccion: string
  deuda_total: number
  valido: boolean
  error?: string
}

export default function ImportarClientesPage() {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [columnas, setColumnas] = useState<string[]>([])
  const [filas, setFilas] = useState<FilaExcel[]>([])
  const [mapeo, setMapeo] = useState<MapeoColumnas>({ nombre: '', telefono: '', direccion: '', deuda_total: '' })
  const [preview, setPreview] = useState<ClientePreview[]>([])
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<{ importados: number; omitidos: number } | null>(null)
  const [archivo, setArchivo] = useState<string>('')

  function leerArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setArchivo(file.name)
    setResultado(null)
    setPreview([])

    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array' })
        const hoja = workbook.Sheets[workbook.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json<FilaExcel>(hoja, { defval: null })

        if (json.length === 0) { toast.error('El archivo está vacío'); return }

        const cols = Object.keys(json[0])
        setColumnas(cols)
        setFilas(json)

        // Auto-detectar columnas comunes
        const autoMapeo: MapeoColumnas = { nombre: '', telefono: '', direccion: '', deuda_total: '' }
        const buscar = (keywords: string[]) =>
          cols.find(c => keywords.some(k => c.toLowerCase().includes(k))) || ''

        autoMapeo.nombre = buscar(['nombre', 'name', 'cliente', 'razón'])
        autoMapeo.telefono = buscar(['telefono', 'teléfono', 'tel', 'celular', 'phone', 'whatsapp'])
        autoMapeo.direccion = buscar(['dirección', 'direccion', 'address', 'domicilio'])
        autoMapeo.deuda_total = buscar(['deuda', 'saldo', 'debe', 'balance'])

        setMapeo(autoMapeo)
        toast.success(`Archivo leído: ${json.length} filas`)
      } catch {
        toast.error('Error al leer el archivo. Verificá que sea un Excel válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function generarPreview() {
    if (!mapeo.nombre) { toast.error('Seleccioná la columna de Nombre'); return }

    const clientes: ClientePreview[] = filas.map((fila) => {
      const nombre = String(fila[mapeo.nombre] || '').trim()
      const telefono = mapeo.telefono ? String(fila[mapeo.telefono] || '').trim() : ''
      const direccion = mapeo.direccion ? String(fila[mapeo.direccion] || '').trim() : ''
      const deudaRaw = mapeo.deuda_total ? fila[mapeo.deuda_total] : null
      const deuda_total = deudaRaw ? parseFloat(String(deudaRaw).replace(/[^0-9.,]/g, '').replace(',', '.')) || 0 : 0

      if (!nombre) return { nombre: '(sin nombre)', telefono, direccion, deuda_total, valido: false, error: 'Nombre vacío' }
      return { nombre, telefono, direccion, deuda_total, valido: true }
    }).filter(c => c.nombre !== '(sin nombre)' || c.valido)

    setPreview(clientes)
  }

  async function importar() {
    const validos = preview.filter(c => c.valido)
    if (validos.length === 0) { toast.error('No hay clientes válidos para importar'); return }

    setImportando(true)
    try {
      // Obtener clientes existentes para detectar duplicados
      const { data: existentes } = await supabase.from('clientes').select('nombre').eq('activo', true)
      const nombresExistentes = new Set((existentes || []).map(c => c.nombre.trim().toLowerCase()))

      const nuevos = validos.filter(c => !nombresExistentes.has(c.nombre.trim().toLowerCase()))
      const omitidos = validos.length - nuevos.length

      if (nuevos.length === 0) {
        toast.warning('Todos los clientes ya existen en el sistema')
        setResultado({ importados: 0, omitidos: validos.length })
        return
      }

      const { error } = await supabase.from('clientes').insert(
        nuevos.map(c => ({
          nombre: c.nombre,
          telefono: c.telefono || null,
          direccion: c.direccion || null,
          deuda_total: c.deuda_total || 0,
          activo: true,
        }))
      )

      if (error) { toast.error('Error al importar: ' + error.message); return }

      setResultado({ importados: nuevos.length, omitidos })
      toast.success(`${nuevos.length} clientes importados correctamente`)
    } finally {
      setImportando(false)
    }
  }

  function resetear() {
    setColumnas([])
    setFilas([])
    setMapeo({ nombre: '', telefono: '', direccion: '', deuda_total: '' })
    setPreview([])
    setResultado(null)
    setArchivo('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const validosCount = preview.filter(c => c.valido).length
  const invalidosCount = preview.filter(c => !c.valido).length

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/clientes"><Button variant="ghost" size="icon"><ArrowLeft size={20} /></Button></Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Importar clientes desde Excel</h1>
          <p className="text-gray-500 text-sm mt-0.5">Cargá un archivo .xlsx o .csv con el listado de clientes</p>
        </div>
      </div>

      {/* Resultado final */}
      {resultado && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-5 flex items-center gap-4">
            <CheckCircle size={32} className="text-green-500 shrink-0" />
            <div>
              <p className="font-semibold text-green-800 text-lg">{resultado.importados} clientes importados</p>
              {resultado.omitidos > 0 && (
                <p className="text-sm text-green-600">{resultado.omitidos} omitidos (ya existían en el sistema)</p>
              )}
            </div>
            <Button variant="outline" onClick={resetear} className="ml-auto gap-2">
              <Upload size={16} /> Importar otro archivo
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Paso 1: Subir archivo */}
      {!resultado && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileSpreadsheet size={18} className="text-green-600" /> Paso 1 — Seleccionar archivo</CardTitle></CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center hover:border-teal-300 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={32} className="mx-auto text-gray-300 mb-3" />
              {archivo ? (
                <div className="flex items-center justify-center gap-2">
                  <span className="text-green-600 font-medium">{archivo}</span>
                  <button onClick={e => { e.stopPropagation(); resetear() }} className="text-gray-400 hover:text-red-400">
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-gray-500 font-medium">Hacé clic para seleccionar el archivo</p>
                  <p className="text-xs text-gray-400 mt-1">Formatos soportados: .xlsx, .xls, .csv</p>
                </>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={leerArchivo} />
          </CardContent>
        </Card>
      )}

      {/* Paso 2: Mapear columnas */}
      {columnas.length > 0 && !resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Paso 2 — Mapear columnas
              <Badge variant="secondary">{filas.length} filas</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {([
                { field: 'nombre' as const, label: 'Nombre *', required: true },
                { field: 'telefono' as const, label: 'Teléfono', required: false },
                { field: 'direccion' as const, label: 'Dirección', required: false },
                { field: 'deuda_total' as const, label: 'Deuda actual', required: false },
              ]).map(({ field, label, required }) => (
                <div key={field}>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">
                    {label} {required && <span className="text-red-500">*</span>}
                  </label>
                  <Select
                    value={mapeo[field] || '__ninguna__'}
                    onValueChange={v => setMapeo(prev => ({ ...prev, [field]: v === '__ninguna__' ? '' : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar columna..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__ninguna__">(No importar)</SelectItem>
                      {columnas.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview primeras filas */}
            {filas.length > 0 && mapeo.nombre && (
              <div className="mt-2">
                <p className="text-xs text-gray-500 mb-2">Vista previa (primeras 3 filas):</p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="text-xs w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        {['nombre', 'telefono', 'direccion', 'deuda_total'].map(f => mapeo[f as keyof MapeoColumnas] && (
                          <th key={f} className="px-3 py-2 text-left text-gray-600 font-medium capitalize">{f}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filas.slice(0, 3).map((fila, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          {['nombre', 'telefono', 'direccion', 'deuda_total'].map(f => mapeo[f as keyof MapeoColumnas] && (
                            <td key={f} className="px-3 py-2 text-gray-700">
                              {String(fila[mapeo[f as keyof MapeoColumnas]] ?? '—')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Button onClick={generarPreview} className="w-full bg-teal-500 hover:bg-teal-600" disabled={!mapeo.nombre}>
              Verificar datos
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Paso 3: Confirmar e importar */}
      {preview.length > 0 && !resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              Paso 3 — Confirmar importación
              <Badge className="bg-green-500">{validosCount} válidos</Badge>
              {invalidosCount > 0 && <Badge variant="destructive">{invalidosCount} con error</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200">
              <table className="text-xs w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Estado</th>
                    <th className="px-3 py-2 text-left">Nombre</th>
                    <th className="px-3 py-2 text-left">Teléfono</th>
                    <th className="px-3 py-2 text-right">Deuda</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i} className={`border-t border-gray-100 ${!c.valido ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2">
                        {c.valido
                          ? <CheckCircle size={13} className="text-green-500" />
                          : <AlertTriangle size={13} className="text-red-500" />
                        }
                      </td>
                      <td className="px-3 py-2 font-medium text-gray-800">{c.nombre}</td>
                      <td className="px-3 py-2 text-gray-600">{c.telefono || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {c.deuda_total > 0 ? `$${c.deuda_total.toLocaleString('es-AR')}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button
              onClick={importar}
              disabled={importando || validosCount === 0}
              className="w-full bg-green-500 hover:bg-green-600 gap-2 h-11"
            >
              <CheckCircle size={18} />
              {importando ? 'Importando...' : `Importar ${validosCount} clientes`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
