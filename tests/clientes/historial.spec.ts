import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/setup/.auth.json' })

test.describe('Clientes - Historial y deuda', () => {

  test('la página de clientes carga la lista', async ({ page }) => {
    await page.goto('/clientes')
    await expect(page.locator('h1, h2').filter({ hasText: /Clientes/i })).toBeVisible({ timeout: 10000 })
  })

  test('historial de Alegre Milagros — solo un Chaleco niño T12', async ({ page }) => {
    // ID conocido de Alegre Milagros
    await page.goto('/clientes/6b90dead-49cb-43de-85f4-3284eaca839f')
    await page.waitForTimeout(2000)

    // Verificar que carga la página del cliente
    await expect(page.locator('text=Alegre Milagros')).toBeVisible({ timeout: 10000 })

    // Verificar que solo tiene 1 compra registrada
    const itemsHistorial = page.locator('text=Chaleco niño')
    await expect(itemsHistorial).toHaveCount(1, { timeout: 5000 })

    // No debe tener zapatillas duplicadas
    const zapatillas = page.locator('text=Zapatilla')
    await expect(zapatillas).toHaveCount(0)
  })

  test('deuda de Pinillo Yamila es $55.880', async ({ page }) => {
    await page.goto('/clientes/bed1c3ff-c270-4412-89a6-68bad2aa463d')
    await page.waitForTimeout(2000)

    await expect(page.locator('text=Pinillo Yamila')).toBeVisible({ timeout: 10000 })

    // La deuda debe ser 55.880
    await expect(page.locator('text=55.880').or(page.locator('text=55,880'))).toBeVisible({ timeout: 5000 })
  })

})
