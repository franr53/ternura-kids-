'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Producto, Variante } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Search, Trash2, Printer } from 'lucide-react'
import { formatPrecio } from '@/lib/utils'

type ProductoConProveedor = Producto & {
  variantes?: Variante[]
  proveedor?: { nombre: string } | null
}

interface EtiquetaItem {
  variante_id: string
  variante: Variante & { producto?: ProductoConProveedor }
  cantidad: number
}

export default function EtiquetasPage() {
  const supabase = createClient()
  const [productos, setProductos] = useState<ProductoConProveedor[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [etiquetas, setEtiquetas] = useState<EtiquetaItem[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoConProveedor | null>(null)

  const cargarProductos = useCallback(async () => {
    const { data } = await supabase
      .from('productos')
      .select('*, variantes(*), proveedor:proveedores(nombre)')
      .eq('activo', true)
      .order('nombre')
    setProductos(data || [])
  }, [supabase])

  useEffect(() => { cargarProductos() }, [cargarProductos])

  function normalizar(s: string) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  }

  const filtrados = busqueda
    ? productos.filter(p => normalizar(p.nombre).includes(normalizar(busqueda)))
    : []

  function agregarVariante(variante: Variante, producto: ProductoConProveedor) {
    const existe = etiquetas.find(e => e.variante_id === variante.id)
    if (existe) return
    setEtiquetas(prev => [...prev, {
      variante_id: variante.id,
      variante: { ...variante, producto },
      cantidad: 1,
    }])
    setBusqueda('')
    setProductoSeleccionado(null)
  }

  function actualizarCantidad(varianteId: string, cantidad: number) {
    setEtiquetas(prev => prev.map(e =>
      e.variante_id === varianteId ? { ...e, cantidad: Math.max(1, cantidad) } : e
    ))
  }

  function eliminarEtiqueta(varianteId: string) {
    setEtiquetas(prev => prev.filter(e => e.variante_id !== varianteId))
  }

  function generarHTML(): string {
    const etiquetasExpandidas: EtiquetaItem[] = []
    etiquetas.forEach(e => {
      for (let i = 0; i < e.cantidad; i++) etiquetasExpandidas.push(e)
    })

    let barcodeIndex = 0
    const etiquetasHTML = etiquetasExpandidas.map(e => {
      const producto = e.variante.producto
      const precioTarjeta = producto?.precio_venta || 0
      const precioEfectivo = Math.round(precioTarjeta * 0.8)
      const marca = producto?.proveedor?.nombre || ''
      const barcode = e.variante.codigo_barras
      const bcId = `bc-${barcodeIndex++}`

      return `
      <div class="etiqueta">
        <div class="top">
          <div class="nombre">${producto?.nombre || ''}</div>
          ${marca ? `<div class="marca-top">${marca}</div>` : ''}
          <div class="talle">T. ${e.variante.talle}</div>
        </div>
        <div class="precios">
          <div class="precio-row">
            <span class="precio-label">Tarjeta</span>
            <span class="precio-valor tarjeta">${formatPrecio(precioTarjeta)}</span>
          </div>
          <div class="precio-row destacado">
            <span class="precio-label">Efectivo</span>
            <span class="precio-valor efectivo">${formatPrecio(precioEfectivo)}</span>
          </div>
        </div>
        ${barcode ? `
        <div class="barcode-wrap">
          <svg id="${bcId}" data-barcode="${barcode}"></svg>
        </div>
        ` : '<div class="barcode-placeholder"></div>'}
        ${marca ? `<div class="marca-bottom">${marca.toUpperCase()}</div>` : ''}
      </div>`
    }).join('')

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiquetas - Ternura Kids</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: white; color: #000; }
    .contenedor {
      display: grid;
      grid-template-columns: repeat(4, 5.2cm);
      gap: 2mm;
      padding: 5mm;
    }
    .etiqueta {
      width: 5.2cm;
      height: 4.2cm;
      border: 1px solid #000;
      padding: 2mm 2.5mm;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      background: white;
    }
    .top { display: flex; flex-direction: column; gap: 0.5mm; }
    .nombre {
      font-size: 7.5pt;
      font-weight: bold;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }
    .marca-top {
      font-size: 6pt;
      color: #555;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .talle {
      font-size: 9pt;
      font-weight: bold;
    }
    .precios {
      display: flex;
      flex-direction: column;
      gap: 0.5mm;
    }
    .precio-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .precio-label {
      font-size: 6.5pt;
      color: #555;
    }
    .precio-valor {
      font-size: 8pt;
      font-weight: bold;
    }
    .precio-row.destacado .precio-valor.efectivo {
      font-size: 10pt;
    }
    .barcode-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .barcode-wrap svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .barcode-placeholder {
      height: 10mm;
    }
    .marca-bottom {
      font-size: 5.5pt;
      text-align: center;
      color: #333;
      letter-spacing: 0.5px;
    }
    @media print {
      body { margin: 0; }
      .contenedor { padding: 3mm; gap: 1mm; }
      @page { margin: 5mm; size: A4; }
    }
  </style>
</head>
<body>
  <div class="contenedor">${etiquetasHTML}</div>
  <script>
    window.onload = function() {
      document.querySelectorAll('[data-barcode]').forEach(function(el) {
        try {
          JsBarcode(el, el.getAttribute('data-barcode'), {
            format: 'CODE128',
            width: 1.2,
            height: 28,
            displayValue: true,
            fontSize: 7,
            margin: 1,
            lineColor: '#000',
            background: '#fff',
          });
        } catch(e) { console.error('Barcode error:', e); }
      });
      setTimeout(function() { window.print(); }, 600);
    };
  </script>
</body>
</html>`
  }

  function imprimirEtiquetas() {
    if (etiquetas.length === 0) return
    const html = generarHTML()
    const ventana = window.open('', '_blank')
    if (ventana) {
      ventana.document.write(html)
      ventana.document.close()
    }
  }

  const totalEtiquetas = etiquetas.reduce((s, e) => s + e.cantidad, 0)

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Etiquetas</h1>
          <p className="text-gray-500 text-sm mt-0.5">Generá etiquetas de precio para imprimir</p>
        </div>
        <Button
          onClick={imprimirEtiquetas}
          disabled={etiquetas.length === 0}
          className="bg-teal-500 hover:bg-teal-600 gap-2"
        >
          <Printer size={18} /> Imprimir ({totalEtiquetas})
        </Button>
      </div>

      {/* Buscador */}
      <Card>
        <CardHeader><CardTitle className="text-base">Agregar producto</CardTitle></CardHeader>
        <CardContent>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Buscar producto por nombre..."
              value={productoSeleccionado ? productoSeleccionado.nombre : busqueda}
              onChange={e => { setBusqueda(e.target.value); setProductoSeleccionado(null) }}
              className="pl-9"
            />
            {filtrados.length > 0 && !productoSeleccionado && (
              <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto mt-1">
                {filtrados.map(producto => (
                  <div key={producto.id}>
                    <div className="px-4 py-2 bg-gray-50 text-xs font-medium text-gray-600 flex justify-between">
                      <span>{producto.nombre}</span>
                      {producto.proveedor?.nombre && (
                        <span className="text-gray-400">{producto.proveedor.nombre}</span>
                      )}
                    </div>
                    {producto.variantes?.map(v => (
                      <button
                        key={v.id}
                        className="w-full text-left px-6 py-2 hover:bg-teal-50 text-sm border-b border-gray-50 last:border-0 flex justify-between items-center"
                        onClick={() => agregarVariante(v, producto)}
                      >
                        <span>
                          Talle {v.talle}
                          <span className="text-gray-400 ml-2">(stock: {v.stock})</span>
                          {v.codigo_barras && <span className="text-gray-400 font-mono ml-2 text-xs">{v.codigo_barras}</span>}
                        </span>
                        <span className="font-medium text-gray-700">{formatPrecio(producto.precio_venta)}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de etiquetas */}
      {etiquetas.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Lista de etiquetas</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {etiquetas.map(e => (
                <div key={e.variante_id} className="flex items-center gap-4 py-2 border-b border-gray-50 last:border-0">
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{e.variante.producto?.nombre}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">T. {e.variante.talle}</Badge>
                      {e.variante.producto?.proveedor?.nombre && (
                        <span className="text-xs text-gray-400">{e.variante.producto.proveedor.nombre}</span>
                      )}
                      <span className="text-sm text-gray-500">
                        {formatPrecio(e.variante.producto?.precio_venta || 0)}
                        <span className="text-xs text-gray-400 ml-1">
                          · ef. {formatPrecio(Math.round((e.variante.producto?.precio_venta || 0) * 0.8))}
                        </span>
                      </span>
                      {e.variante.codigo_barras && (
                        <span className="text-xs text-gray-400 font-mono">{e.variante.codigo_barras}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-gray-500">Cant:</Label>
                    <Input
                      type="number"
                      value={e.cantidad}
                      onChange={ev => actualizarCantidad(e.variante_id, parseInt(ev.target.value) || 1)}
                      className="w-20 text-center"
                      min="1"
                    />
                  </div>
                  <button onClick={() => eliminarEtiqueta(e.variante_id)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-gray-500 text-sm">Total etiquetas a imprimir</span>
              <Badge className="bg-teal-500">{totalEtiquetas}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {etiquetas.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Printer size={48} className="mx-auto mb-3 opacity-30" />
          <p>Buscá un producto y seleccioná el talle para agregar etiquetas</p>
        </div>
      )}
    </div>
  )
}
