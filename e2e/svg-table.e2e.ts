// SVG namespaces and table structure as parsed by a real browser (happy-dom's parser differs).
import { expect, test } from '@playwright/test'
import { FIXTURES } from './apps'

const SVG_NS = 'http://www.w3.org/2000/svg'
const HTML_NS = 'http://www.w3.org/1999/xhtml'

test.beforeEach(async ({ page }) => {
  await page.goto(FIXTURES)
  await expect(page.locator('svg.chart')).toBeVisible()
})

test('SVG component roots and conditional branches are real SVG elements', async ({ page }) => {
  const ns = (sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => e.namespaceURI))
  expect(await ns('svg.chart circle')).toEqual([SVG_NS, SVG_NS])
  expect(await ns('svg.chart line.axis')).toEqual([SVG_NS])
  expect(await ns('svg.chart g.badge, svg.chart g.badge *')).toEqual([SVG_NS, SVG_NS, SVG_NS])
  expect(await ns('foreignObject p.html')).toEqual([HTML_NS])

  // Rendered with geometry, not as unknown HTML elements.
  const box = await page.locator('svg.chart circle').nth(1).evaluate((c) => {
    const { x, y, width, height } = (c as SVGCircleElement).getBBox()
    return { x, y, width, height }
  })
  expect(box).toMatchObject({ x: 26, y: 36, width: 8, height: 8 })
  expect(await page.locator('g.badge text').textContent()).toBe('new')

  await page.click('.add-point')
  await expect(page.locator('svg.chart circle')).toHaveCount(3)
  expect(await ns('svg.chart circle')).toEqual([SVG_NS, SVG_NS, SVG_NS])

  await page.click('.toggle-axis')
  await expect(page.locator('line.axis')).toHaveCount(0)
  await page.click('.toggle-axis')
  expect(await ns('svg.chart line.axis')).toEqual([SVG_NS])
  expect(await ns('foreignObject p.html')).toEqual([HTML_NS])
})

test('tables keep the written structure, and rows update in place', async ({ page }) => {
  const table = page.locator('table.stock')
  expect(await table.locator(':scope > *').evaluateAll((els) => els.map((e) => e.tagName))).toEqual([
    'CAPTION',
    'THEAD',
    'TBODY',
    'TFOOT',
  ])
  await expect(table.locator('tbody > tr.row')).toHaveText(['apples3', 'pears5'])
  await expect(table.locator('tfoot .total')).toHaveText('8')

  const first = await table.locator('tbody > tr.row').first().elementHandle()
  await page.click('.more')
  await expect(table.locator('tfoot .total')).toHaveText('9')
  await expect(table.locator('tbody > tr.row').first()).toHaveText('apples4')
  expect(await first!.evaluate((tr) => tr.isConnected)).toBe(true)

  await page.click('.add-row')
  await expect(table.locator('tbody > tr.row')).toHaveText(['apples4', 'pears5', 'plums1'])
  await expect(table.locator('tbody')).toHaveCount(1)
})

test('the browser parser would rewrite the markup Keeno rejects', async ({ page }) => {
  // Why `<table><tr>` is a compile error: the parser inserts a <tbody>, so compiled
  // firstChild/nextSibling paths would point at the wrong nodes.
  const parsed = await page.evaluate(() => {
    const t = document.createElement('template')
    t.innerHTML = '<table><tr><td>a</td></tr></table>'
    const html = (t.content.firstChild as Element).innerHTML
    t.innerHTML = '<circle r="1"></circle>'
    const unwrapped = (t.content.firstChild as Element).namespaceURI
    return { html, unwrapped }
  })
  expect(parsed.html).toBe('<tbody><tr><td>a</td></tr></tbody>')
  expect(parsed.unwrapped).toBe(HTML_NS)
})
