// Base común de las mediciones de pantalla. SÓLO contra una copia local de la app:
// corta cualquier pedido a *.supabase.co para que nunca escriba en producción.
import { chromium } from '@playwright/test'

export async function abrir(baseUrl, { email, password }) {
  const u = new URL(baseUrl)
  if (!['localhost', '127.0.0.1'].includes(u.hostname)) throw new Error(`sólo copia local, no ${baseUrl}`)
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } })
  await page.route(/supabase\.co/, r => r.abort())
  await page.goto(baseUrl + '/login')
  await page.fill('input[type=email]', email)
  await page.fill('input[type=password]', password)
  await page.press('input[type=password]', 'Enter')
  await page.waitForURL(x => !x.pathname.startsWith('/login'), { timeout: 30000 })
  return { browser, page }
}

// Cuenta lo que hace una persona: cada toque, cada campo que escribe y cada escaneo.
export function contador(page) {
  const pasos = []
  return {
    pasos,
    toque: async (loc, que) => { await loc.click(); pasos.push(`toque: ${que}`) },
    escribir: async (loc, texto, que) => { await loc.fill(texto); pasos.push(`escribir: ${que}`) },
    escanear: async (loc, codigo) => { await loc.fill(codigo); await loc.press('Enter'); pasos.push('escaneo') },
    get total() { return pasos.length },
  }
}
