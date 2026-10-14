// renderStrategy in the dev server: ssr streams and hydrates, islands only hydrates `client=` components.
import { expect, test } from '@playwright/test'
import { ISLANDS, SSR } from './apps'

test.describe('ssr', () => {
  test('the HTML has the page, its <Head> tags and the status', async ({ request }) => {
    const res = await request.get(SSR, { headers: { accept: 'text/html' } })
    const html = await res.text()
    expect(res.status()).toBe(200)
    expect(html).toContain('<title data-kn-head="">Home · Site</title>')
    expect(html).not.toContain('Fallback title')
    expect(html).toContain('hello from the server')
    expect(html).toContain('count 5')
    expect((await request.get(`${SSR}nope`, { headers: { accept: 'text/html' } })).status()).toBe(404)
  })

  test('hydrates: events work, and navigation updates the head', async ({ page }) => {
    await page.goto(SSR)
    await expect(page).toHaveTitle('Home · Site')
    // The server HTML is there before the page hydrates: retry the click until it does.
    await expect(async () => {
      await page.click('.counter')
      await expect(page.locator('.counter')).not.toHaveText('count 5', { timeout: 500 })
    }).toPass()
    await expect(page.locator('.counter')).toHaveCSS('color', 'rgb(9, 8, 7)')
    await page.click('a[href="/about"]')
    await expect(page.locator('.about')).toHaveText('About')
    await expect(page).toHaveTitle('About · Site')
    await page.click('.plain')
    await expect(page.locator('.plain')).toHaveText('plain 1')
  })
})

test.describe('islands', () => {
  test('a page without islands loads no component code and stays static', async ({ page }) => {
    const scripts: string[] = []
    page.on('request', (r) => r.url().includes('.kn') && !r.url().includes('type=style') && scripts.push(r.url()))
    await page.goto(`${ISLANDS}about`)
    await expect(page).toHaveTitle('About · Site')
    await expect(page.locator('nav')).toHaveCSS('color', 'rgb(1, 2, 3)')
    await page.click('.plain')
    await expect(page.locator('.plain')).toHaveText('plain 0')
    expect(scripts).toEqual([])
  })

  test('a client="visible" island loads and hydrates on its own', async ({ page }) => {
    const loaded = page.waitForRequest((r) => r.url().includes('/src/components/Counter.kn') && !r.url().includes('type=style'))
    await page.goto(ISLANDS)
    await loaded
    await expect(page.locator('.home')).toHaveText('hello from the server')
    await expect(async () => {
      await page.click('.counter')
      await expect(page.locator('.counter')).not.toHaveText('count 5', { timeout: 500 })
    }).toPass()
    await expect(page.locator('.counter')).toHaveCSS('color', 'rgb(9, 8, 7)')
  })
})
