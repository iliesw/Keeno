// Router, Transition, Portal, ErrorBoundary and lazy() in real browsers.
import { expect, test } from '@playwright/test'
import { FIXTURES } from './apps'

const url = (path: string) => new URL(`features${path}`, FIXTURES).href

test('router: links, params, history, base path and lazy routes', async ({ page }) => {
  await page.goto(url('/'))
  await expect(page.locator('.home')).toBeVisible()
  await expect(page.locator('.nav-home')).toHaveClass(/active/)
  await expect(page.locator('.nav-home')).toHaveAttribute('href', '/features/')

  await page.click('.nav-user1')
  await expect(page).toHaveURL(url('/users/1'))
  await expect(page.locator('.user')).toHaveText('user 1 ')
  await expect(page.locator('.nav-user1')).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.nav-home')).not.toHaveClass(/active/)
  const created = await page.locator('.user').getAttribute('data-created')

  // Same route, new params: the component is kept.
  await page.click('.nav-user2')
  await expect(page.locator('.user')).toHaveText('user 2 ')
  expect(await page.locator('.user').getAttribute('data-created')).toBe(created)

  await page.goBack()
  await expect(page.locator('.user')).toHaveText('user 1 ')
  await page.goBack()
  await expect(page.locator('.home')).toBeVisible()
  await page.goForward()
  await expect(page.locator('.user')).toHaveText('user 1 ')

  await page.click('.nav-lazy')
  await expect(page.locator('.lazy-page')).toHaveText('lazy page')

  // Deep link with a query, and a path no route matches.
  await page.goto(url('/users/7?tab=posts'))
  await expect(page.locator('.user')).toHaveText('user 7 posts')
  await page.goto(url('/nowhere'))
  await expect(page.locator('.not-found')).toBeVisible()
})

test('router: modified clicks are left to the browser', async ({ page, context }) => {
  await page.goto(url('/'))
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  const popup = context.waitForEvent('page')
  await page.click('.nav-user1', { modifiers: [modifier] })
  await (await popup).close()
  await expect(page).toHaveURL(url('/'))
})

test('Transition keeps a leaving element until its CSS transition ends', async ({ page }) => {
  await page.goto(url('/'))
  await page.click('.toggle-panel')
  const panel = page.locator('.panel')
  await expect(panel).toHaveClass(/fade-enter-active/)
  await expect(panel).not.toHaveClass(/fade-enter/, { timeout: 2000 })
  expect(await panel.evaluate((el) => getComputedStyle(el).opacity)).toBe('1')

  // Record the leave in the page: class changes, and how long the element stays connected.
  await page.evaluate(() => {
    const el = document.querySelector('.panel')!
    const log: string[] = ((window as any).__leave = [])
    const start = performance.now()
    new MutationObserver(() => log.push(el.isConnected ? el.className : `removed after ${performance.now() - start}`)).observe(
      document.body,
      { attributes: true, subtree: true, childList: true },
    )
  })
  await page.click('.toggle-panel')
  await expect(panel).toHaveCount(0, { timeout: 2000 })
  const log: string[] = await page.evaluate(() => (window as any).__leave)
  expect(log.some((c) => /fade-leave-from fade-leave-active/.test(c))).toBe(true)
  expect(log.some((c) => /fade-leave-active fade-leave-to/.test(c))).toBe(true)
  const removed = log.find((l) => l.startsWith('removed after'))!
  expect(Number(removed.slice('removed after '.length))).toBeGreaterThanOrEqual(140)
})

test('Portal renders into body and is removed with its owner', async ({ page }) => {
  await page.goto(url('/'))
  await page.click('.open-modal')
  const modal = page.locator('body > .modal')
  await expect(modal).toBeVisible()
  expect(await page.locator('#app .modal').count()).toBe(0)
  await page.click('.close-modal')
  await expect(page.locator('.modal')).toHaveCount(0)
})

test('ErrorBoundary shows the fallback and recovers with reset', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(url('/'))
  await expect(page.locator('.fragile')).toHaveText('fine')
  await page.click('.break')
  await expect(page.locator('.caught')).toContainText('broken on purpose')
  await expect(page.locator('.fragile')).toHaveCount(0)
  await page.click('.retry')
  await expect(page.locator('.fragile')).toHaveText('fine')
  expect(errors).toEqual([])
})

test('dev mode: the devtools hook lists the component tree', async ({ page }) => {
  await page.goto(url('/users/3'))
  await expect(page.locator('.user')).toBeVisible()
  const names = await page.evaluate(() => {
    const out: string[] = []
    const walk = (nodes: any[]) => nodes.forEach((n) => (out.push(n.name), walk(n.children)))
    walk((globalThis as any).__LUX_DEVTOOLS__.tree())
    return out
  })
  expect(names).toContain('Router')
  expect(names.some((n) => n.includes('User'))).toBe(true)
})
