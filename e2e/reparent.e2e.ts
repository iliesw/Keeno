// reparentable(): content moved between places keeps its component state everywhere, and its
// DOM state (focus, iframe contents) where the browser has the native moveBefore.
import { expect, test } from '@playwright/test'
import { FIXTURES } from './apps'

test('reparentable content keeps its state when it moves', async ({ page }) => {
  await page.goto(new URL('reparent', FIXTURES).href)
  const native = (await page.locator('.native').textContent()) === 'native'
  const frame = page.frameLocator('.frame')

  await expect(page.locator('.sidebar .player')).toBeVisible()
  await frame.locator('#inc').click()
  await frame.locator('#inc').click()
  await expect(frame.locator('#inc')).toHaveText('2')
  await page.fill('.note', 'hello')
  await page.focus('.note')

  await page.evaluate(() => (window as any).toggle())
  await expect(page.locator('.modal .player')).toBeVisible()
  await expect(page.locator('.sidebar')).toHaveCount(0)
  // Component state: same instance, same input contents.
  await expect(page.locator('.typed')).toHaveText('hello')
  await expect(page.locator('.note')).toHaveValue('hello')
  expect(await page.evaluate(() => (window as any).playerInits)).toBe(1)

  if (native) {
    // DOM state: the iframe was never detached (not reloaded) and the input kept focus.
    await expect(frame.locator('#inc')).toHaveText('2')
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('note')
  }

  await page.evaluate(() => (window as any).toggle())
  await expect(page.locator('.sidebar .player')).toBeVisible()
  await expect(page.locator('.player')).toHaveCount(1)
  if (native) await expect(frame.locator('#inc')).toHaveText('2')
})

test('reparentable content moved imperatively keeps its state', async ({ page }) => {
  await page.goto(new URL('reparent', FIXTURES).href)
  const native = (await page.locator('.native').textContent()) === 'native'
  const frame = page.frameLocator('.frame')
  await frame.locator('#inc').click()
  await page.fill('.note', 'hi')
  await page.focus('.note')

  await page.evaluate(() => (window as any).toCorner())
  await expect(page.locator('#corner .player')).toBeVisible()
  await expect(page.locator('.sidebar .player')).toHaveCount(0)
  await expect(page.locator('.typed')).toHaveText('hi')
  if (native) {
    await expect(frame.locator('#inc')).toHaveText('1')
    expect(await page.evaluate(() => document.activeElement?.className)).toBe('note')
  }

  // Taken out of the page and brought back, still the same instance.
  await page.evaluate(() => (window as any).hide())
  await expect(page.locator('.player')).toHaveCount(0)
  await page.evaluate(() => (window as any).toCorner())
  await expect(page.locator('#corner .typed')).toHaveText('hi')

  // A place in markup that renders it anew takes it back.
  await page.evaluate(() => (window as any).toggle())
  await expect(page.locator('.modal .player')).toBeVisible()
  await expect(page.locator('#corner .player')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).playerInits)).toBe(1)
})
