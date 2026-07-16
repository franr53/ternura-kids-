import { test, expect } from '@playwright/test'
import fs from 'fs'

test.use({ storageState: 'tests/setup/.auth.json' })

const OUT = '/tmp/claude-1000/-mnt-d-orka-brain/e070f6ae-03a8-4f29-bd81-299874d52394/scratchpad'

test('ventas: descargar comprobante PDF desde el historial', async ({ page }) => {
  const errores: string[] = []
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })

  await page.goto('/ventas')
  // Ampliar el rango para asegurar que haya ventas
  await page.getByRole('button', { name: 'Mes' }).click()
  await page.waitForTimeout(2500)

  // Expandir la primera venta de la lista
  const primeraVenta = page.locator('div.bg-white.border.rounded-2xl').first()
  await expect(primeraVenta).toBeVisible({ timeout: 10000 })
  await primeraVenta.locator('div.cursor-pointer').first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${OUT}/verif-ventas-expandida.png`, fullPage: false })

  // Click en "PDF" y capturar la descarga
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: 'PDF', exact: true }).first().click(),
  ])
  const pdfPath = `${OUT}/verif-comprobante.pdf`
  await download.saveAs(pdfPath)

  const bytes = fs.readFileSync(pdfPath)
  expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
  expect(bytes.length).toBeGreaterThan(3000)
  console.log('COMPROBANTE OK — bytes:', bytes.length, '| errores consola:', errores.length)
  expect(errores.join('\n')).not.toContain('html2canvas')
})

test('cliente: enviar estado de cuenta (PDF) desde el perfil', async ({ page }) => {
  const errores: string[] = []
  page.on('console', m => { if (m.type() === 'error') errores.push(m.text()) })

  await page.goto('/clientes')
  await page.waitForTimeout(2500)

  // Buscar un cliente con botón de estado de cuenta (requiere teléfono).
  const filas = page.locator('tbody tr')
  const n = Math.min(await filas.count(), 8)
  let encontrado = false
  for (let i = 0; i < n; i++) {
    await page.goto('/clientes')
    await page.waitForTimeout(1500)
    await page.locator('tbody tr').nth(i).click()
    await page.waitForTimeout(1500)
    const btn = page.getByRole('button', { name: /estado de cuenta/i })
    if (await btn.count() > 0) {
      await page.screenshot({ path: `${OUT}/verif-cliente-perfil.png`, fullPage: true })
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        btn.first().click(),
      ])
      const pdfPath = `${OUT}/verif-estado-cuenta.pdf`
      await download.saveAs(pdfPath)
      const bytes = fs.readFileSync(pdfPath)
      expect(bytes.subarray(0, 4).toString()).toBe('%PDF')
      expect(bytes.length).toBeGreaterThan(3000)
      console.log('ESTADO CUENTA OK — bytes:', bytes.length, '| errores consola:', errores.length)
      encontrado = true
      break
    }
  }
  expect(encontrado, 'ningún cliente de los primeros 8 tenía teléfono para probar el estado de cuenta').toBe(true)
})
