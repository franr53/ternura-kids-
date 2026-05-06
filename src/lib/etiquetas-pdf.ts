import { formatPrecio } from '@/lib/utils'
import { LOGO_BASE64 } from '@/lib/logo-base64'

export interface EtiquetaData {
  nombre: string
  marca: string
  talle: string
  codigoBarras?: string
  precioLista: number
  precioEfectivo: number
}

const HTML2CANVAS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'
const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/3.0.3/jspdf.umd.min.js'

export function generarHTMLEtiquetas(items: EtiquetaData[]): string {
  let barcodeIndex = 0
  const etiquetasHTML = items.map(item => {
    const bcId = `bc-${barcodeIndex++}`
    const nombre = item.nombre.toUpperCase()
    const marca = item.marca.toUpperCase()
    const talle = item.talle

    return `
    <div class="etiqueta">
      <div class="acento"></div>
      <div class="cuerpo">
        <div class="nombre">${nombre}</div>
        <div class="sub">${marca ? `<span class="marca">${marca}</span>` : ''}<span class="talle-badge">T${talle}</span></div>
        ${item.codigoBarras ? `
        <div class="barcode-wrap">
          <svg id="${bcId}" data-barcode="${item.codigoBarras}"></svg>
        </div>
        ` : '<div class="barcode-placeholder"></div>'}
        <div class="precios">
          <div class="precio-efec">${formatPrecio(item.precioEfectivo)}<span class="efec-label">efec</span></div>
          <div class="precio-lista">${formatPrecio(item.precioLista)}<span class="lista-label">list</span></div>
        </div>
      </div>
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Etiquetas - Ternura Kids</title>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; color: #000; }
    body { font-family: Arial, sans-serif; background: #fff; color: #000; }
    .contenedor {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 0;
      padding: 4mm;
      width: 210mm;
    }
    .etiqueta {
      border: 1px solid #e0e0e0;
      background: white;
      overflow: hidden;
      min-height: 30mm;
      display: flex;
      flex-direction: column;
    }
    .acento {
      display: none;
    }
    .cuerpo {
      padding: 2mm 3mm 2.5mm;
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .nombre {
      font-size: 7.5pt;
      font-weight: 700;
      line-height: 1.2;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #111;
    }
    .sub {
      display: flex;
      align-items: center;
      gap: 1.5mm;
      margin-top: 0.5mm;
      margin-bottom: 1mm;
    }
    .marca {
      font-size: 6.5pt;
      color: #777;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .talle-badge {
      font-size: 6.5pt;
      font-weight: 700;
      background: #fff;
      color: #111;
      border: 1px solid #555;
      padding: 0.3mm 1.5mm;
      border-radius: 2px;
      flex-shrink: 0;
    }
    .barcode-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 1;
      margin: 0.5mm 0;
    }
    .barcode-wrap svg {
      max-width: 100%;
      height: auto;
      display: block;
    }
    .barcode-placeholder {
      flex: 1;
      min-height: 12mm;
    }
    .precios {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-top: 1mm;
      padding-top: 1mm;
      border-top: 1px solid #eee;
    }
    .precio-efec {
      font-size: 11pt;
      font-weight: 800;
      color: #111;
      display: flex;
      align-items: baseline;
      gap: 1mm;
    }
    .efec-label {
      font-size: 6pt;
      font-weight: 400;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .precio-lista {
      font-size: 9.5pt;
      font-weight: 800;
      color: #111;
      display: flex;
      align-items: baseline;
      gap: 1mm;
    }
    .lista-label {
      font-size: 6pt;
      font-weight: 400;
      color: #555;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
  </style>
</head>
<body>
  <div class="contenedor">${etiquetasHTML}</div>
  <script>
    document.querySelectorAll('[data-barcode]').forEach(function(el) {
      try {
        JsBarcode(el, el.getAttribute('data-barcode'), {
          format: 'CODE128',
          width: 1.5,
          height: 38,
          displayValue: true,
          fontSize: 8,
          margin: 1,
          lineColor: '#000',
          background: '#fff',
        });
      } catch(e) { console.error('Barcode error:', e); }
    });
  <\/script>
</body>
</html>`
}

function injectScript(doc: Document, src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = doc.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error(`No se pudo cargar: ${src}`))
    doc.head.appendChild(script)
  })
}

// Cuántas filas de 3 etiquetas caben por página A4 (~30mm por fila, margin 5mm)
const ROWS_PER_PAGE = 8  // 8 filas × 3 col = 24 etiquetas por página
const ITEMS_PER_PAGE = ROWS_PER_PAGE * 3

async function renderPageToCanvas(
  items: EtiquetaData[],
  iframeDoc: Document,
  iframeWin: Window,
): Promise<HTMLCanvasElement> {
  // Reemplazar contenido del contenedor con las etiquetas de esta página
  const contenedor = iframeDoc.querySelector('.contenedor') as HTMLElement
  contenedor.innerHTML = ''

  let barcodeIndex = 0
  items.forEach(item => {
    const bcId = `bc-${barcodeIndex++}`
    const nombre = (item.nombre || '').toUpperCase()
    const marca = (item.marca || '').toUpperCase()
    const div = iframeDoc.createElement('div')
    div.className = 'etiqueta'
    div.innerHTML = `
      <div class="acento"></div>
      <div class="cuerpo">
        <div class="nombre">${nombre}</div>
        <div class="sub">${marca ? `<span class="marca">${marca}</span>` : ''}<span class="talle-badge">T${item.talle}</span></div>
        ${item.codigoBarras ? `<div class="barcode-wrap"><svg id="${bcId}" data-barcode="${item.codigoBarras}"></svg></div>` : '<div class="barcode-placeholder"></div>'}
        <div class="precios">
          <div class="precio-efec">${formatPrecio(item.precioEfectivo)}<span class="efec-label">efec</span></div>
          <div class="precio-lista">${formatPrecio(item.precioLista)}<span class="lista-label">list</span></div>
        </div>
      </div>`
    contenedor.appendChild(div)
  })

  // Renderizar barcodes con JsBarcode
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const JsBarcode = (iframeWin as any).JsBarcode
  if (JsBarcode) {
    iframeDoc.querySelectorAll('[data-barcode]').forEach(el => {
      try {
        JsBarcode(el, el.getAttribute('data-barcode'), {
          format: 'CODE128', width: 1.5, height: 38, displayValue: true,
          fontSize: 8, margin: 1, lineColor: '#000', background: '#fff',
        })
      } catch (e) { console.error('Barcode error:', e) }
    })
  }
  await new Promise(r => setTimeout(r, 200))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvas = await (iframeWin as any).html2canvas(contenedor, {
    scale: 2, useCORS: true, logging: false,
  })
  return canvas
}

async function generarBlobEtiquetas(items: EtiquetaData[]): Promise<Blob> {
  // Usamos una plantilla vacía para el iframe base (sin etiquetas aún)
  const htmlBase = generarHTMLEtiquetas([])

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '-9999px'
  iframe.style.width = '210mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  iframe.srcdoc = htmlBase

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    setTimeout(resolve, 3000)
  })

  const iframeWin = iframe.contentWindow
  const iframeDoc = iframe.contentDocument || iframeWin?.document
  if (!iframeDoc || !iframeWin) {
    document.body.removeChild(iframe)
    throw new Error('No se pudo crear el iframe para el PDF')
  }

  try {
    await injectScript(iframeDoc, HTML2CANVAS_CDN)
    await injectScript(iframeDoc, JSPDF_CDN)
  } catch (e) {
    document.body.removeChild(iframe)
    throw e
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = iframeWin as any
  if (!win.html2canvas || !win.jspdf?.jsPDF) {
    document.body.removeChild(iframe)
    throw new Error('html2canvas o jsPDF no disponibles')
  }

  const jsPDF = win.jspdf.jsPDF

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageW = 210
    const margin = 5
    const contentW = pageW - margin * 2

    // Renderizar página por página para evitar canvas gigante
    const pages: EtiquetaData[][] = []
    for (let i = 0; i < items.length; i += ITEMS_PER_PAGE) {
      pages.push(items.slice(i, i + ITEMS_PER_PAGE))
    }

    for (let p = 0; p < pages.length; p++) {
      if (p > 0) pdf.addPage()
      const canvas = await renderPageToCanvas(pages[p], iframeDoc, iframeWin)
      const drawH = (canvas.height * contentW) / canvas.width
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      pdf.addImage(imgData, 'JPEG', margin, margin, contentW, drawH)
    }

    return pdf.output('blob') as Blob
  } finally {
    document.body.removeChild(iframe)
  }
}

export async function generarPDFEtiquetas(items: EtiquetaData[]): Promise<Blob> {
  const blob = await generarBlobEtiquetas(items)
  // Auto-download
  const fecha = new Date().toISOString().slice(0, 10)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `etiquetas_${fecha}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return blob
}

export async function compartirPDFWhatsApp(blob: Blob, nombre: string, telefono: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], nombre, { type: 'application/pdf' })

  // En celular: share nativo → el PDF se manda directo por WhatsApp
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'Ternura Kids' })
    return 'shared'
  }

  // En PC: descargar PDF + abrir chat del cliente
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  const tel = telefono.replace(/\D/g, '')
  const num = tel.startsWith('54') ? tel : `54${tel}`
  window.open(`https://wa.me/${num}`, '_blank')
  return 'downloaded'
}

// --- Comprobante de venta PDF ---

export interface ComprobanteData {
  items: { nombre: string; talle: string; cantidad: number; precio: number }[]
  subtotal: number
  descuento: number
  total: number
  metodoPago: string
  clienteNombre?: string
  descuentoPorcentaje?: string
  fiado?: { monto: number; deudaAnterior: number; deudaActual: number }
  fecha: string
}

export function generarHTMLComprobante(data: ComprobanteData): string {
  const itemsHTML = data.items.map(i => {
    const desc = i.cantidad > 1
      ? `${i.cantidad}x ${i.nombre} T${i.talle}`
      : `${i.nombre} T${i.talle}`
    return `
      <div class="item">
        <span class="item-desc">${desc}</span>
        <span class="item-price">${formatPrecio(i.precio * i.cantidad)}</span>
      </div>`
  }).join('')

  let totalesHTML = ''
  if (data.descuento > 0) {
    totalesHTML += `
      <div class="total-row">
        <span>Subtotal</span><span>${formatPrecio(data.subtotal)}</span>
      </div>
      <div class="total-row discount">
        <span>Descuento${data.descuentoPorcentaje ? ` ${data.descuentoPorcentaje}` : ''}</span><span>-${formatPrecio(data.descuento)}</span>
      </div>`
  }
  totalesHTML += `
    <div class="total-row total-final">
      <span>TOTAL</span><span>${formatPrecio(data.total)}</span>
    </div>
    <div class="total-row metodo">
      <span>Pago</span><span>${data.metodoPago}</span>
    </div>`

  let fiadoHTML = ''
  if (data.fiado) {
    fiadoHTML = `
    <div class="fiado-block">
      <div class="fiado-title">Cuenta corriente</div>
      ${data.fiado.monto > 0 ? `<div class="fiado-row"><span>Fiado en esta compra</span><span>${formatPrecio(data.fiado.monto)}</span></div>` : ''}
      <div class="fiado-row"><span>Deuda anterior</span><span>${formatPrecio(data.fiado.deudaAnterior)}</span></div>
      <div class="fiado-row fiado-actual"><span>Deuda actual</span><span>${formatPrecio(data.fiado.deudaActual)}</span></div>
    </div>`
  }

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #1a1a1a; font-variant-numeric: tabular-nums; }

    .comprobante {
      width: 80mm;
      padding: 5mm 4mm;
    }

    /* --- Header con logo --- */
    .header {
      text-align: center;
      padding-bottom: 3mm;
      border-bottom: 1px dashed #ccc;
    }
    .header img {
      width: 30mm;
      height: auto;
      margin-bottom: 2mm;
    }
    .store-info {
      font-size: 7pt;
      color: #888;
      line-height: 1.4;
    }

    /* --- Datos transacción --- */
    .meta {
      padding: 3mm 0;
      border-bottom: 1px dashed #ccc;
    }
    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #555;
    }
    .meta-row .label { color: #999; }
    .meta-row .value { font-weight: 600; color: #333; }

    /* --- Items --- */
    .items {
      padding: 3mm 0;
      border-bottom: 1px dashed #ccc;
    }
    .item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1.5mm 0;
      font-size: 9pt;
      gap: 2mm;
    }
    .item:not(:last-child) {
      border-bottom: 1px solid #f0f0f0;
    }
    .item-desc {
      flex: 1;
      word-break: break-word;
      color: #333;
    }
    .item-price {
      flex-shrink: 0;
      font-weight: 600;
      text-align: right;
      min-width: 18mm;
    }

    /* --- Totales --- */
    .totales {
      padding: 3mm 0;
    }
    .total-row {
      display: flex;
      justify-content: space-between;
      font-size: 9pt;
      padding: 1mm 0;
      color: #555;
    }
    .total-row.discount { color: #4EC3BD; }
    .total-row.total-final {
      font-size: 13pt;
      font-weight: 700;
      color: #1a1a1a;
      padding: 2.5mm 0;
      margin-top: 1mm;
      border-top: 2px solid #1a1a1a;
    }
    .total-row.metodo {
      font-size: 8pt;
      color: #888;
      padding-top: 1mm;
    }

    /* --- Fiado --- */
    .fiado-block {
      margin-top: 3mm;
      padding: 3mm;
      background: #FFF8E7;
      border-left: 3px solid #F59E0B;
      border-radius: 2px;
    }
    .fiado-title {
      font-size: 8pt;
      font-weight: 700;
      color: #92400E;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 1.5mm;
    }
    .fiado-row {
      display: flex;
      justify-content: space-between;
      font-size: 8pt;
      color: #78350F;
      padding: 0.5mm 0;
    }
    .fiado-row.fiado-actual {
      font-weight: 700;
      font-size: 9pt;
      padding-top: 1mm;
      margin-top: 1mm;
      border-top: 1px solid #F59E0B;
    }

    /* --- Footer --- */
    .footer {
      text-align: center;
      padding-top: 3mm;
      margin-top: 3mm;
      border-top: 1px dashed #ccc;
      font-size: 8pt;
      color: #aaa;
    }
    .footer .thanks {
      font-size: 9pt;
      color: #4EC3BD;
      font-weight: 600;
      margin-bottom: 1mm;
    }
  </style>
</head>
<body>
  <div class="comprobante">

    <div class="header">
      <img src="${LOGO_BASE64}" alt="Ternura Kids" />
      <div class="store-info">Indumentaria infantil</div>
    </div>

    <div class="meta">
      <div class="meta-row">
        <span class="label">Fecha</span>
        <span class="value">${data.fecha}</span>
      </div>
      ${data.clienteNombre ? `
      <div class="meta-row">
        <span class="label">Cliente</span>
        <span class="value">${data.clienteNombre}</span>
      </div>` : ''}
    </div>

    <div class="items">
      ${itemsHTML}
    </div>

    <div class="totales">
      ${totalesHTML}
    </div>

    ${fiadoHTML}

    <div class="footer">
      <div class="thanks">¡Gracias por tu compra!</div>
      <div>Ternura Kids · ternurakids.com</div>
    </div>

  </div>
</body>
</html>`
}

export async function generarPDFComprobante(data: ComprobanteData): Promise<Blob> {
  const html = generarHTMLComprobante(data)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '-9999px'
  iframe.style.width = '80mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  iframe.srcdoc = html

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    setTimeout(resolve, 2000)
  })

  const iframeWin = iframe.contentWindow
  const iframeDoc = iframe.contentDocument || iframeWin?.document
  if (!iframeDoc || !iframeWin) {
    document.body.removeChild(iframe)
    throw new Error('No se pudo crear el iframe para el comprobante')
  }

  const comprobante = iframeDoc.querySelector('.comprobante') as HTMLElement | null
  if (!comprobante) {
    document.body.removeChild(iframe)
    throw new Error('No se encontró el comprobante')
  }

  try {
    await injectScript(iframeDoc, HTML2CANVAS_CDN)
    await injectScript(iframeDoc, JSPDF_CDN)
  } catch (e) {
    document.body.removeChild(iframe)
    throw e
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = iframeWin as any
  const html2canvas = win.html2canvas
  const jsPDF = win.jspdf?.jsPDF

  if (!html2canvas || !jsPDF) {
    document.body.removeChild(iframe)
    throw new Error('html2canvas o jsPDF no disponibles')
  }

  try {
    const canvas = await html2canvas(comprobante, { scale: 2, useCORS: true, logging: false })

    // PDF tamaño 80mm de ancho, alto dinámico según contenido
    const pdfW = 80
    const margin = 3
    const contentW = pdfW - margin * 2
    const contentH = (canvas.height * contentW) / canvas.width
    const pdfH = contentH + margin * 2

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    pdf.addImage(imgData, 'JPEG', margin, margin, contentW, contentH)

    return pdf.output('blob') as Blob
  } finally {
    document.body.removeChild(iframe)
  }
}

// --- Recibo de abono PDF ---

export interface ReciboAbonoData {
  clienteNombre: string
  fecha: string
  montoAbono: number
  metodoPago: string
  deudaAnterior: number
  deudaActual: number
  ultimasCompras: { nombre: string; talle: string; precio: number; fecha: string }[]
}

export function generarHTMLRecibo(data: ReciboAbonoData): string {
  const comprasHTML = data.ultimasCompras.length > 0
    ? data.ultimasCompras.map(c => `
      <div class="item">
        <span class="item-desc">${c.nombre}${c.talle ? ` T${c.talle}` : ''}</span>
        <span class="item-meta">${c.fecha}</span>
        <span class="item-price">${formatPrecio(c.precio)}</span>
      </div>`).join('')
    : '<div class="empty">Sin compras fiadas recientes</div>'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #1a1a1a; font-variant-numeric: tabular-nums; }

    .recibo { width: 80mm; padding: 5mm 4mm; }

    .header { text-align: center; padding-bottom: 3mm; border-bottom: 1px dashed #ccc; }
    .header img { width: 30mm; height: auto; margin-bottom: 2mm; }
    .header .tipo { font-size: 10pt; font-weight: 700; color: #4EC3BD; text-transform: uppercase; letter-spacing: 1px; margin-top: 2mm; }
    .header .store-info { font-size: 7pt; color: #888; }

    .meta { padding: 3mm 0; border-bottom: 1px dashed #ccc; }
    .meta-row { display: flex; justify-content: space-between; font-size: 8pt; color: #555; padding: 0.5mm 0; }
    .meta-row .label { color: #999; }
    .meta-row .value { font-weight: 600; color: #333; }

    .abono-block { padding: 3mm 0; border-bottom: 1px dashed #ccc; }
    .abono-row { display: flex; justify-content: space-between; font-size: 9pt; padding: 1mm 0; }
    .abono-row.highlight { font-size: 12pt; font-weight: 700; color: #4EC3BD; padding: 2mm 0; }
    .abono-row .label { color: #666; }

    .cuenta-block { margin: 3mm 0; padding: 3mm; background: #F0FDF4; border-left: 3px solid #22C55E; border-radius: 2px; }
    .cuenta-block.con-deuda { background: #FFF8E7; border-left-color: #F59E0B; }
    .cuenta-title { font-size: 8pt; font-weight: 700; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1.5mm; }
    .cuenta-block.con-deuda .cuenta-title { color: #92400E; }
    .cuenta-row { display: flex; justify-content: space-between; font-size: 8pt; color: #166534; padding: 0.5mm 0; }
    .cuenta-block.con-deuda .cuenta-row { color: #78350F; }
    .cuenta-row.actual { font-weight: 700; font-size: 9pt; padding-top: 1mm; margin-top: 1mm; border-top: 1px solid #22C55E; }
    .cuenta-block.con-deuda .cuenta-row.actual { border-top-color: #F59E0B; }

    .compras { padding: 3mm 0; }
    .compras-title { font-size: 8pt; font-weight: 600; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2mm; }
    .item { display: flex; align-items: baseline; padding: 1mm 0; font-size: 8pt; gap: 1.5mm; border-bottom: 1px solid #f5f5f5; }
    .item:last-child { border-bottom: none; }
    .item-desc { flex: 1; color: #333; }
    .item-meta { color: #aaa; font-size: 7pt; flex-shrink: 0; }
    .item-price { flex-shrink: 0; font-weight: 600; text-align: right; min-width: 15mm; }
    .empty { font-size: 8pt; color: #ccc; text-align: center; padding: 2mm 0; }

    .footer { text-align: center; padding-top: 3mm; margin-top: 3mm; border-top: 1px dashed #ccc; font-size: 8pt; color: #aaa; }
    .footer .thanks { font-size: 9pt; color: #4EC3BD; font-weight: 600; margin-bottom: 1mm; }
  </style>
</head>
<body>
  <div class="recibo">
    <div class="header">
      <img src="${LOGO_BASE64}" alt="Ternura Kids" />
      <div class="tipo">Recibo de pago</div>
      <div class="store-info">Indumentaria infantil</div>
    </div>

    <div class="meta">
      <div class="meta-row"><span class="label">Fecha</span><span class="value">${data.fecha}</span></div>
      <div class="meta-row"><span class="label">Cliente</span><span class="value">${data.clienteNombre}</span></div>
    </div>

    <div class="abono-block">
      <div class="abono-row highlight"><span>Abono recibido</span><span>${formatPrecio(data.montoAbono)}</span></div>
      <div class="abono-row"><span class="label">Método</span><span>${data.metodoPago}</span></div>
    </div>

    <div class="cuenta-block${data.deudaActual > 0 ? ' con-deuda' : ''}">
      <div class="cuenta-title">${data.deudaActual === 0 ? '¡Cuenta al día!' : 'Cuenta corriente'}</div>
      <div class="cuenta-row"><span>Deuda anterior</span><span>${formatPrecio(data.deudaAnterior)}</span></div>
      <div class="cuenta-row"><span>Este abono</span><span>-${formatPrecio(data.montoAbono)}</span></div>
      <div class="cuenta-row actual"><span>Saldo actual</span><span>${formatPrecio(data.deudaActual)}</span></div>
    </div>

    ${data.ultimasCompras.length > 0 ? `
    <div class="compras">
      <div class="compras-title">Últimas compras fiadas</div>
      ${comprasHTML}
    </div>` : ''}

    <div class="footer">
      <div class="thanks">¡Gracias por tu pago!</div>
      <div>Ternura Kids</div>
    </div>
  </div>
</body>
</html>`
}

export async function generarPDFRecibo(data: ReciboAbonoData): Promise<Blob> {
  const html = generarHTMLRecibo(data)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '-9999px'
  iframe.style.width = '80mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  iframe.srcdoc = html

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    setTimeout(resolve, 2000)
  })

  const iframeWin = iframe.contentWindow
  const iframeDoc = iframe.contentDocument || iframeWin?.document
  if (!iframeDoc || !iframeWin) {
    document.body.removeChild(iframe)
    throw new Error('No se pudo crear el iframe para el recibo')
  }

  const recibo = iframeDoc.querySelector('.recibo') as HTMLElement | null
  if (!recibo) {
    document.body.removeChild(iframe)
    throw new Error('No se encontró el recibo')
  }

  try {
    await injectScript(iframeDoc, HTML2CANVAS_CDN)
    await injectScript(iframeDoc, JSPDF_CDN)
  } catch (e) {
    document.body.removeChild(iframe)
    throw e
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = iframeWin as any
  const html2canvas = win.html2canvas
  const jsPDF = win.jspdf?.jsPDF

  if (!html2canvas || !jsPDF) {
    document.body.removeChild(iframe)
    throw new Error('html2canvas o jsPDF no disponibles')
  }

  try {
    const canvas = await html2canvas(recibo, { scale: 2, useCORS: true, logging: false })
    const pdfW = 80
    const margin = 3
    const contentW = pdfW - margin * 2
    const contentH = (canvas.height * contentW) / canvas.width
    const pdfH = contentH + margin * 2

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    pdf.addImage(imgData, 'JPEG', margin, margin, contentW, contentH)

    return pdf.output('blob') as Blob
  } finally {
    document.body.removeChild(iframe)
  }
}

// --- Comprobante de cambio/devolución PDF ---

export interface CambioData {
  fecha: string
  clienteNombre?: string
  clienteTelefono?: string
  itemsDevueltos: { nombre: string; talle: string; cantidad: number; precio: number }[]
  itemsNuevos: { nombre: string; talle: string; cantidad: number; precio: number }[]
  totalDevuelto: number
  totalNuevo: number
  diferencia: number
  resolucion: string // 'saldo_favor'|'efectivo'|'transferencia'|'fiado'|'ninguna'
}

function resolucionLabel(r: string, diferencia: number): string {
  if (diferencia === 0) return 'Cambio exacto'
  if (r === 'saldo_favor') return 'Saldo a favor del cliente'
  if (r === 'efectivo') return diferencia > 0 ? 'Se devuelve efectivo al cliente' : 'Cliente abona en efectivo'
  if (r === 'transferencia') return diferencia > 0 ? 'Se devuelve por transferencia' : 'Cliente abona por transferencia'
  if (r === 'fiado') return 'Se agrega a cuenta corriente'
  return 'Sin resolución'
}

export function generarHTMLCambio(data: CambioData): string {
  const renderItems = (items: typeof data.itemsDevueltos) =>
    items.map(i => {
      const desc = i.cantidad > 1 ? `${i.cantidad}x ${i.nombre} T${i.talle}` : `${i.nombre} T${i.talle}`
      return `<div class="item"><span class="item-desc">${desc}</span><span class="item-price">${formatPrecio(i.precio * i.cantidad)}</span></div>`
    }).join('')

  const difLabel = data.diferencia > 0
    ? `<span class="dif-favor">Saldo a favor: ${formatPrecio(data.diferencia)}</span>`
    : data.diferencia < 0
      ? `<span class="dif-paga">A pagar: ${formatPrecio(Math.abs(data.diferencia))}</span>`
      : `<span class="dif-exacto">Cambio exacto</span>`

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #1a1a1a; font-variant-numeric: tabular-nums; }
    .comprobante { width: 80mm; padding: 5mm 4mm; }
    .header { text-align: center; padding-bottom: 3mm; border-bottom: 1px dashed #ccc; }
    .header img { width: 30mm; height: auto; margin-bottom: 2mm; }
    .header .tipo { font-size: 10pt; font-weight: 700; color: #4EC3BD; text-transform: uppercase; letter-spacing: 1px; margin-top: 2mm; }
    .header .store-info { font-size: 7pt; color: #888; }
    .meta { padding: 3mm 0; border-bottom: 1px dashed #ccc; }
    .meta-row { display: flex; justify-content: space-between; font-size: 8pt; color: #555; padding: 0.5mm 0; }
    .meta-row .label { color: #999; }
    .meta-row .value { font-weight: 600; color: #333; }
    .section { padding: 2.5mm 0; border-bottom: 1px dashed #ccc; }
    .section-title { font-size: 7.5pt; font-weight: 700; color: #999; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 1.5mm; }
    .item { display: flex; justify-content: space-between; align-items: flex-start; padding: 1.2mm 0; font-size: 8.5pt; gap: 2mm; border-bottom: 1px solid #f0f0f0; }
    .item:last-child { border-bottom: none; }
    .item-desc { flex: 1; word-break: break-word; color: #333; }
    .item-price { flex-shrink: 0; font-weight: 600; text-align: right; min-width: 15mm; }
    .subtotal-row { display: flex; justify-content: space-between; font-size: 8.5pt; font-weight: 600; color: #555; padding-top: 1.5mm; margin-top: 0.5mm; border-top: 1px solid #eee; }
    .diferencia-block { padding: 3mm 0; text-align: center; }
    .dif-favor { font-size: 12pt; font-weight: 700; color: #16a34a; }
    .dif-paga { font-size: 12pt; font-weight: 700; color: #dc2626; }
    .dif-exacto { font-size: 11pt; font-weight: 600; color: #4EC3BD; }
    .resolucion { font-size: 8pt; color: #888; margin-top: 1mm; }
    .footer { text-align: center; padding-top: 3mm; margin-top: 3mm; border-top: 1px dashed #ccc; font-size: 8pt; color: #aaa; }
    .footer .thanks { font-size: 9pt; color: #4EC3BD; font-weight: 600; margin-bottom: 1mm; }
  </style>
</head>
<body>
  <div class="comprobante">
    <div class="header">
      <img src="${LOGO_BASE64}" alt="Ternura Kids" />
      <div class="tipo">Cambio / Devolución</div>
      <div class="store-info">Indumentaria infantil</div>
    </div>
    <div class="meta">
      <div class="meta-row"><span class="label">Fecha</span><span class="value">${data.fecha}</span></div>
      ${data.clienteNombre ? `<div class="meta-row"><span class="label">Cliente</span><span class="value">${data.clienteNombre}</span></div>` : ''}
    </div>
    <div class="section">
      <div class="section-title">Prendas devueltas</div>
      ${renderItems(data.itemsDevueltos)}
      <div class="subtotal-row"><span>Subtotal devuelto</span><span>${formatPrecio(data.totalDevuelto)}</span></div>
    </div>
    ${data.itemsNuevos.length > 0 ? `
    <div class="section">
      <div class="section-title">Prendas llevadas</div>
      ${renderItems(data.itemsNuevos)}
      <div class="subtotal-row"><span>Subtotal llevado</span><span>${formatPrecio(data.totalNuevo)}</span></div>
    </div>` : ''}
    <div class="diferencia-block">
      ${difLabel}
      <div class="resolucion">${resolucionLabel(data.resolucion, data.diferencia)}</div>
    </div>
    <div class="footer">
      <div class="thanks">¡Gracias por tu compra!</div>
      <div>Ternura Kids</div>
    </div>
  </div>
</body>
</html>`
}

export async function generarPDFCambio(data: CambioData): Promise<Blob> {
  const html = generarHTMLCambio(data)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-9999px'
  iframe.style.top = '-9999px'
  iframe.style.width = '80mm'
  iframe.style.height = '297mm'
  document.body.appendChild(iframe)

  iframe.srcdoc = html

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    setTimeout(resolve, 2000)
  })

  const iframeWin = iframe.contentWindow
  const iframeDoc = iframe.contentDocument || iframeWin?.document
  if (!iframeDoc || !iframeWin) {
    document.body.removeChild(iframe)
    throw new Error('No se pudo crear el iframe para el comprobante de cambio')
  }

  const comprobante = iframeDoc.querySelector('.comprobante') as HTMLElement | null
  if (!comprobante) {
    document.body.removeChild(iframe)
    throw new Error('No se encontró el comprobante de cambio')
  }

  try {
    await injectScript(iframeDoc, HTML2CANVAS_CDN)
    await injectScript(iframeDoc, JSPDF_CDN)
  } catch (e) {
    document.body.removeChild(iframe)
    throw e
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = iframeWin as any
  const html2canvas = win.html2canvas
  const jsPDF = win.jspdf?.jsPDF

  if (!html2canvas || !jsPDF) {
    document.body.removeChild(iframe)
    throw new Error('html2canvas o jsPDF no disponibles')
  }

  try {
    const canvas = await html2canvas(comprobante, { scale: 2, useCORS: true, logging: false })
    const pdfW = 80
    const margin = 3
    const contentW = pdfW - margin * 2
    const contentH = (canvas.height * contentW) / canvas.width
    const pdfH = contentH + margin * 2
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [pdfW, pdfH] })
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    pdf.addImage(imgData, 'JPEG', margin, margin, contentW, contentH)
    return pdf.output('blob') as Blob
  } finally {
    document.body.removeChild(iframe)
  }
}

export async function compartirPDFCambioWhatsApp(data: CambioData): Promise<'shared' | 'downloaded'> {
  const blob = await generarPDFCambio(data)
  const fecha = data.fecha.replace(/\//g, '-')
  const nombre = `cambio_${fecha}.pdf`
  const tel = data.clienteTelefono || ''
  return compartirPDFWhatsApp(blob, nombre, tel)
}

// --- WhatsApp tel persistence ---

const WHATSAPP_TEL_KEY = 'etiquetas_whatsapp_tel'

export function getWhatsAppTel(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(WHATSAPP_TEL_KEY) || ''
}

export function setWhatsAppTel(tel: string): void {
  localStorage.setItem(WHATSAPP_TEL_KEY, tel)
}
