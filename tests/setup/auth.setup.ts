import { test as setup, expect } from '@playwright/test'

const AUTH_FILE = 'tests/setup/.auth.json'

setup('autenticar usuario', async ({ page }) => {
  const email = process.env.TEST_EMAIL
  const password = process.env.TEST_PASSWORD
  if (!email || !password) throw new Error('TEST_EMAIL y TEST_PASSWORD deben estar en .env.local')

  await page.goto('/login')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  await expect(page).toHaveURL(/dashboard/, { timeout: 10000 })
  await page.context().storageState({ path: AUTH_FILE })
})
