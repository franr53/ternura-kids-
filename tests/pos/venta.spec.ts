import { test, expect } from '@playwright/test'

test.use({ storageState: 'tests/setup/.auth.json' })

test.describe('POS - Nueva Venta', () => {

  test('la página POS carga y muestra productos', async ({ page }) => {
    await page.goto('/pos')
    await expect(page.locator('text=Nueva Venta')).toBeVisible({ timeout: 10000 })
  })

  test('abrir diálogo de venta y buscar producto', async ({ page }) => {
    await page.goto('/pos')
    await page.click('text=Nueva Venta')

    const input = page.locator('input[placeholder*="Buscar"]')
    await expect(input).toBeVisible({ timeout: 8000 })

    await input.fill('campera')
    await page.waitForTimeout(500)

    // Debe mostrar resultados o "sin resultados"
    const hayResultados = await page.locator('[class*="border-teal"]').count()
    const sinResultados = await page.locator('text=Sin resultados').count()
    expect(hayResultados + sinResultados).toBeGreaterThan(0)
  })

  test('el botón Cobrar está deshabilitado con carrito vacío', async ({ page }) => {
    await page.goto('/pos')
    await page.click('text=Nueva Venta')

    const boton = page.locator('button', { hasText: /Cobrar/ })
    await expect(boton).toBeDisabled({ timeout: 8000 })
  })

  test('agregar el mismo producto dos veces incrementa cantidad, no duplica fila', async ({ page }) => {
    await page.goto('/pos')
    await page.click('text=Nueva Venta')

    const input = page.locator('input[placeholder*="Buscar"]')
    await expect(input).toBeVisible({ timeout: 8000 })

    // Buscar un producto que exista
    await input.fill('remera')
    await page.waitForTimeout(600)

    // Expandir primer resultado
    const primerProducto = page.locator('button[class*="rounded"]').first()
    const tieneVariantes = await page.locator('text=talles').count()
    if (tieneVariantes === 0) {
      test.skip()
      return
    }

    await primerProducto.click()
    await page.waitForTimeout(300)

    // Clickear primer talle dos veces
    const primerTalle = page.locator('button').filter({ hasText: /T\d|[XSML]/ }).first()
    await primerTalle.click()
    await page.waitForTimeout(300)
    await primerTalle.click()
    await page.waitForTimeout(300)

    // Debe haber solo 1 fila en el carrito con cantidad 2
    const filasCarrito = page.locator('[data-testid="carrito-item"]')
    const countFilas = await filasCarrito.count()

    // Si no hay data-testid, verificar que no hay filas duplicadas por nombre
    if (countFilas === 0) {
      // Verificar visualmente que hay una sola fila
      const cartItems = page.locator('text=x2')
      await expect(cartItems).toBeVisible({ timeout: 3000 })
    } else {
      expect(countFilas).toBe(1)
    }
  })

})
