import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic()

const PROMPT = `Sos un asistente que analiza remitos y boletas de proveedores de ropa infantil argentina.
Extraé la información y devolvé SOLO JSON válido, sin texto adicional ni markdown.

Campos a extraer:
- proveedorNombre: nombre de la fábrica o proveedor si aparece (string o null)
- numeroRemito: número de remito o factura si aparece (string o null)
- items: array de artículos con estos campos:
  - nombre: nombre del artículo tal como aparece
  - talle: puede ser número (2,4,6,8,10,12,14,16), letra (XS,S,M,L,XL,XXL), meses (3m,6m,9m,12m,18m,24m), o null si no aparece
  - cantidad: número entero de unidades
  - precio_unitario: precio de costo por unidad como número, o null si no aparece
  - confianza: "alta" si lo leíste claramente, "baja" si hay dudas o ilegibilidad

Formato exacto de respuesta (sin nada más):
{"proveedorNombre":null,"numeroRemito":null,"items":[{"nombre":"...","talle":"...","cantidad":1,"precio_unitario":null,"confianza":"alta"}]}`

export async function POST(req: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY no configurada en .env.local' }, { status: 500 })
  }

  try {
    const body = await req.json()

    let content: Anthropic.MessageParam['content']

    if (body.type === 'image') {
      const { imageBase64, mimeType } = body as { imageBase64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' }
      content = [
        { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
        { type: 'text', text: PROMPT },
      ]
    } else if (body.type === 'text') {
      const { texto } = body as { texto: string }
      content = [{ type: 'text', text: `${PROMPT}\n\nTexto del remito/lista:\n${texto}` }]
    } else {
      return NextResponse.json({ error: 'Tipo inválido. Usá "image" o "text".' }, { status: 400 })
    }

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{ role: 'user', content }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : ''

    // Extraer JSON aunque haya texto extra
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'La IA no devolvió un formato válido. Intentá con otra foto.' }, { status: 400 })
    }

    const data = JSON.parse(jsonMatch[0])
    return NextResponse.json(data)
  } catch (err) {
    console.error('scan-remito error:', err)
    return NextResponse.json({ error: 'Error al analizar el remito. Verificá la API key y reintentá.' }, { status: 500 })
  }
}
