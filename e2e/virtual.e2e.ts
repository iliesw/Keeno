// <Virtual> in a real browser: only the rows in view exist, scrolling and jumping move the window.
import { expect, test } from '@playwright/test'
import { FIXTURES } from './apps'

test.beforeEach(async ({ page }) => {
  await page.goto(`${FIXTURES}virtual`)
  await expect(page.locator('.row').first()).toHaveText('Row 0')
})

test('renders only the visible rows, and scrolling replaces them', async ({ page }) => {
  // 240px / 24px = 10 rows, plus 4 overscan below.
  expect(await page.locator('.row').count()).toBeLessThan(20)
  await page.locator('.list').evaluate((el) => (el.scrollTop = 24 * 100))
  await expect(page.locator('.row', { hasText: /^Row 100$/ })).toBeVisible()
  await expect(page.locator('.row', { hasText: /^Row 0$/ })).toHaveCount(0)
  expect(await page.locator('.row').count()).toBeLessThan(30)
})

test('scrollTo through ref, list updates and row events', async ({ page }) => {
  await page.click('.jump')
  await expect(page.locator('.row', { hasText: /^Row 5000$/ })).toBeVisible()
  await page.locator('.row', { hasText: /^Row 5001$/ }).click()
  await expect(page.locator('.clicks')).toHaveText('1')
  await page.locator('.list').evaluate((el) => (el.scrollTop = 0))
  await page.click('.prepend')
  await expect(page.locator('.row').first()).toHaveText('New')
})
