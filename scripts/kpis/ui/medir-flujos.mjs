// META "vender rápido": cuántos pasos (toques + campos + escaneos) lleva cada venta común.
// Uso: node medir-flujos.mjs <url-local> <usuarios.json> <codigo-1> <codigo-2> <codigo-3> "<clienta>"
// Hace ventas reales EN LA COPIA LOCAL (baja stock y, en fiado, suma deuda a la clienta).
import fs from 'fs'
import { abrir, contador } from './comun.mjs'

const [url, usuarios, c1, c2, c3, clienta] = process.argv.slice(2)
const mama = JSON.parse(fs.readFileSync(usuarios))[0]
const { browser, page } = await abrir(url, mama)
const resultado = {}

async function venta(nombre, codigo, { conClienta = false, fiado = false } = {}) {
  await page.goto(url + '/pos')
  const c = contador(page)
  await c.toque(page.getByRole('button', { name: /Nueva venta/ }).first(), 'Nueva venta')
  const buscar = page.getByPlaceholder('Buscar por nombre o escanear código...')
  await buscar.waitFor({ timeout: 60000 })
  await page.waitForFunction(() => !document.querySelector('input[placeholder="Cargando..."]'))
  await c.escanear(buscar, codigo)
  if (conClienta) {
    await c.escribir(page.getByPlaceholder('Buscar cliente...'), clienta, 'nombre de la clienta')
    await c.toque(page.getByRole('button', { name: new RegExp(clienta) }).first(), 'elegir clienta')
  }
  if (fiado) await c.toque(page.getByRole('button', { name: /^Fiado$/ }), 'Fiado')
  await c.toque(page.getByRole('button', { name: /^Cobrar/ }), 'Cobrar')
  const listo = page.getByText('Venta registrada').first()
  await listo.waitFor({ timeout: 20000 })
  await c.toque(page.getByRole('button', { name: /^Cerrar$/ }), 'Cerrar')
  resultado[nombre] = { pasos: c.total, detalle: c.pasos }
}

await venta('contado_sin_clienta', c1)
await venta('contado_con_clienta', c2, { conClienta: true })
await venta('fiado_con_clienta', c3, { conClienta: true, fiado: true })
console.log(JSON.stringify(resultado, null, 2))
await browser.close()
