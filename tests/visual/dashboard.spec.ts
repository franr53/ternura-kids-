import { test, expect } from '@playwright/test'

test.describe('Dashboard', () => {
  test('loads dashboard page', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveTitle(/Ternura Kids/)
  })

  test('shows KPI cards', async ({ page }) => {
    await page.goto('/dashboard')
    // Wait for the page to load content
    await page.waitForTimeout(2000)
    await expect(page.locator('text=Ventas Hoy')).toBeVisible()
  })

  test('screenshot comparison', async ({ page }) => {
    await page.goto('/dashboard')
    await page.waitForTimeout(3000)
    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixelRatio: 0.1,
    })
  })
})
