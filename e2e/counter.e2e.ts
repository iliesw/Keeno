// examples/counter in Chromium: number inputs with `validate`, persist and undo/redo.
import { expect, test, type Page } from '@playwright/test'
import { COUNTER } from './apps'

const count = (page: Page) => page.locator('p strong')
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

test.beforeEach(async ({ page }) => {
  await page.goto(COUNTER)
  await expect(count(page)).toHaveText('0')
})

test('bind:value on a number input stores numbers, and validate corrects the input', async ({ page }) => {
  const step = page.locator('input[type=number]')
  await expect(step).toHaveValue('1')

  await step.fill('5')
  await expect(button(page, '+5')).toBeVisible()
  await button(page, '+5').click()
  await expect(count(page)).toHaveText('5')
  await expect(page.locator('.parity')).toHaveText('The count is odd.')

  // validate rounds and enforces >= 1; the input shows the stored value.
  await step.fill('2.6')
  await expect(step).toHaveValue('3')
  await expect(button(page, '+3')).toBeVisible()
  await step.fill('0')
  await expect(step).toHaveValue('1')
  await expect(button(page, '+1')).toBeVisible()

  // Empty input is rejected: the state keeps its value and the input shows it again.
  await step.fill('7')
  await step.fill('')
  await expect(step).toHaveValue('7')
  await expect(button(page, '+7')).toBeVisible()

  // state -> input: the arrow keys change the input, which flows back into the labels.
  await step.press('ArrowUp')
  await expect(button(page, '+8')).toBeVisible()
})

test('validate clamps the count and conditional classes follow it', async ({ page }) => {
  await page.locator('input[type=number]').fill('60')
  await button(page, '+60').click()
  await expect(page.locator('p.warn')).toBeVisible()
  await expect(page.locator('p.warn')).not.toHaveClass(/max/)
  await button(page, '+60').click()
  await expect(count(page)).toHaveText('100')
  await expect(page.locator('p.warn')).toHaveClass(/max/)
  await button(page, 'reset').click()
  await expect(page.locator('p.warn')).toHaveCount(0)
})

test('persist and undo/redo survive together', async ({ page }) => {
  await button(page, '+1').click()
  await button(page, '+1').click()
  await expect(count(page)).toHaveText('2')
  await button(page, 'undo').click()
  await expect(count(page)).toHaveText('1')
  await button(page, 'redo').click()
  await expect(count(page)).toHaveText('2')
  await expect(button(page, 'redo')).toBeDisabled()

  await page.reload()
  await expect(count(page)).toHaveText('2')
  // History is per page load.
  await expect(button(page, 'undo')).toBeDisabled()
})
