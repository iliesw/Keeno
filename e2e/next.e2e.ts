// Async deriveds with <Loading>, store() and router view transitions in real browsers.
import { expect, test } from '@playwright/test'
import { FIXTURES } from './apps'

const url = (path: string) => new URL(`next${path}`, FIXTURES).href

test('async derived: fallback, value, then stale while revalidating', async ({ page }) => {
  await page.goto(url('/'))
  await expect(page.locator('.profile-loading')).toBeVisible()
  await expect(page.locator('.profile-name')).toHaveText('user 1')
  await page.click('.next-user')
  await expect(page.locator('.profile-refreshing')).toBeVisible()
  await expect(page.locator('.profile-name')).toHaveText('user 1')
  await expect(page.locator('.profile-name')).toHaveText('user 2')
  await expect(page.locator('.profile-refreshing')).toHaveCount(0)
})

test('store: nested mutation, bind on a store path, keyed list', async ({ page }) => {
  await page.goto(url('/cart'))
  await expect(page.locator('.cart-total')).toHaveText('1')
  await page.click('.cart-more')
  await expect(page.locator('.cart-total')).toHaveText('2')
  await page.click('.cart-add')
  await expect(page.locator('.cart-item')).toHaveCount(2)
  await expect(page.locator('.cart-total')).toHaveText('4')
  await page.fill('.cart-name >> nth=0', 'pencil')
  await expect(page.locator('.cart-name').first()).toHaveValue('pencil')
})

test('router view transitions: used where supported, plain navigation elsewhere', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any
    w.__transitions = 0
    const start = (document as any).startViewTransition
    if (typeof start === 'function') {
      ;(document as any).startViewTransition = function (cb: () => void) {
        w.__transitions++
        return start.call(document, cb)
      }
    }
  })
  await page.goto(url('/'))
  await expect(page.locator('.profile-name')).toHaveText('user 1')
  const supported = await page.evaluate(() => typeof (document as any).startViewTransition === 'function')
  await page.click('.nav-cart')
  await expect(page).toHaveURL(url('/cart'))
  await expect(page.locator('.cart-total')).toHaveText('1')
  await page.goBack()
  await expect(page.locator('.profile-name')).toBeVisible()
  expect(await page.evaluate(() => (window as any).__transitions)).toBe(supported ? 2 : 0)
})
