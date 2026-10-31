// META "la vendedora no ve plata sensible": entra con la cuenta de la vendedora y anota qué ve.
// Uso: node datos-sensibles.mjs <url-local> <usuarios.json>   (la vendedora es la 2ª cuenta)
// Meta: 0 de 8. Hoy, sin rol, se espera que vea todo.
import fs from 'fs'
import { abrir } from './comun.mjs'

const [url, usuarios] = process.argv.slice(2)
const vendedora = JSON.parse(fs.readFileSync(usuarios))[1]
const { browser, page } = await abrir(url, vendedora)
const ve = {}

async function pantalla(ruta) {
  await page.goto(url + ruta)
  await page.waitForTimeout(4000)
  return !new URL(page.url()).pathname.startsWith('/login') && new URL(page.url()).pathname.startsWith(ruta)
}
for (const [clave, ruta] of [['finanzas', '/finanzas'], ['dashboard', '/dashboard'], ['gastos', '/gastos'], ['reportes', '/reportes'], ['proveedores_y_deuda_a_marcas', '/proveedores']]) {
  ve[clave] = await pantalla(ruta)
}
await pantalla('/pos')
await page.getByRole('button', { name: 'Este mes' }).click().catch(() => {})
await page.waitForTimeout(2500)
ve.total_del_mes_en_pos = await page.getByText('Total mes').isVisible().catch(() => false)

await pantalla('/clientes')
ve.deuda_total_de_todas = await page.getByText('Deuda total acumulada').isVisible().catch(() => false)

await pantalla('/inventario')
// el costo aparece al tocar el precio de un talle (y además se puede editar)
await page.locator('tbody tr').first().click().catch(() => {})
await page.waitForTimeout(1000)
await page.locator('tbody tr button', { hasText: '$' }).first().click().catch(() => {})
await page.waitForTimeout(1000)
ve.costo_o_margen_en_inventario = (await page.getByText(/Costo:|% margen/).count()) > 0

const vistos = Object.values(ve).filter(Boolean).length
console.log(JSON.stringify({ ve, resumen: `ve ${vistos} de ${Object.keys(ve).length} datos sensibles` }, null, 2))
await browser.close()
