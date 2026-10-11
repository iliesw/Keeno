// examples/todo in Chromium: keyed lists, bindings, scoped styles, lifecycle and state options.
import { expect, test, type Page } from '@playwright/test'
import { TODO } from './apps'

const items = (page: Page) => page.locator('main ul > li')

async function open(page: Page, query = '') {
  await page.goto(TODO + query)
  await expect(page.locator('h1')).toHaveText('Todos')
}

async function addTodo(page: Page, text: string) {
  await page.fill('input.draft', text)
  await page.click('button[type=submit]')
}

test.describe('keyed list', () => {
  test('toggling, adding and removing touch only the affected <li>', async ({ page }) => {
    await open(page)
    await expect(items(page)).toHaveText(['Read the plan✕', 'Build Lux✕'])

    // Record every mutation under the <ul>, and tag the current <li> nodes.
    await page.evaluate(() => {
      const ul = document.querySelector('main ul')!
      ul.querySelectorAll('li').forEach((li, i) => ((li as any).__tag = i))
      const w = window as any
      w.__records = []
      w.__mo = new MutationObserver((rs) => w.__records.push(...rs))
      w.__mo.observe(ul, { subtree: true, childList: true, attributes: true, characterData: true })
    })
    const takeRecords = () =>
      page.evaluate(() => {
        const w = window as any
        const rs: MutationRecord[] = [...w.__records, ...w.__mo.takeRecords()]
        w.__records = []
        const ul = document.querySelector('main ul')!
        const liOf = (n: Node) => [...ul.children].indexOf((n instanceof Element ? n : n.parentElement)!.closest('li')!)
        return rs.map((r) => ({
          type: r.type,
          target: r.target === ul ? 'ul' : `li${liOf(r.target)}`,
          added: [...r.addedNodes].map((n) => n.textContent),
          removed: [...r.removedNodes].map((n) => n.textContent),
        }))
      })

    // Toggle the second item: only its own <li> changes (its class).
    await items(page).nth(1).locator('input[type=checkbox]').check()
    await expect(items(page).nth(1)).toHaveClass(/done/)
    const toggled = await takeRecords()
    expect(toggled.length).toBeGreaterThan(0)
    expect(toggled.every((r) => r.target === 'li1')).toBe(true)

    // Add: one <li> inserted into the <ul>, nothing else touched.
    await addTodo(page, 'Test in Chromium')
    await expect(items(page)).toHaveCount(3)
    expect(await takeRecords()).toEqual([{ type: 'childList', target: 'ul', added: ['Test in Chromium✕'], removed: [] }])

    // Remove the first: one <li> removed, the others are the same nodes.
    await items(page).first().getByRole('button').click()
    await expect(items(page)).toHaveCount(2)
    expect(await takeRecords()).toEqual([{ type: 'childList', target: 'ul', added: [], removed: ['Read the plan✕'] }])
    expect(await items(page).evaluateAll((lis) => lis.map((li) => (li as any).__tag))).toEqual([1, undefined])
  })
})

test.describe('bind:value', () => {
  test('input -> state and state -> input', async ({ page }) => {
    await open(page)
    await expect(page.locator('.preview')).toHaveText('Draft: (empty)')
    await page.locator('input.draft').pressSequentially('hello')
    await expect(page.locator('.preview')).toHaveText('Draft: hello')

    await page.click('button.suggest')
    await expect(page.locator('input.draft')).toHaveValue('Write docs')
    await expect(page.locator('.preview')).toHaveText('Draft: Write docs')

    await page.click('button[type=submit]')
    await expect(page.locator('input.draft')).toHaveValue('')
    await expect(items(page).last()).toHaveText('Write docs✕')
  })
})

test.describe('scoped styles', () => {
  test("App and TodoItem rules don't leak into each other", async ({ page }) => {
    await open(page)
    const bg = (sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor)
    const teal = 'rgb(0, 128, 128)'
    const crimson = 'rgb(220, 20, 60)'
    // Both components style `button`; each rule applies only to its own component's markup.
    expect(await bg('button[type=submit]')).toBe(teal)
    expect(await bg('button.undo')).toBe(teal)
    expect(await bg('main li button')).toBe(crimson)
    // App's `input { flex: 1 }` doesn't reach TodoItem's checkbox; TodoItem's `li` rule applies.
    expect(await page.locator('input.draft').evaluate((el) => getComputedStyle(el).flexGrow)).toBe('1')
    expect(await page.locator('main li input[type=checkbox]').first().evaluate((el) => getComputedStyle(el).flexGrow)).toBe('0')
    expect(await page.locator('main li').first().evaluate((el) => getComputedStyle(el).display)).toBe('flex')
    // App's `p { color: #555 }` applies to App's paragraphs only, and the scope classes differ.
    expect(await page.locator('p.count').evaluate((el) => getComputedStyle(el).color)).toBe('rgb(85, 85, 85)')
    const appScope = await page.locator('main').getAttribute('class')
    const itemScope = await page.locator('main li').first().getAttribute('class')
    expect(appScope).toMatch(/^lux-[0-9a-f]{8}$/)
    expect(itemScope).toMatch(/lux-[0-9a-f]{8}/)
    expect(itemScope).not.toContain(appScope!)
  })
})

test.describe('lifecycle', () => {
  test('init and destroy run when the list is hidden and shown', async ({ page }) => {
    const logs: string[] = []
    page.on('console', (m) => {
      if (/^\[(App|TodoItem)\]/.test(m.text())) logs.push(m.text())
    })
    await open(page)
    await expect(items(page)).toHaveCount(2)
    await expect.poll(() => logs.length).toBe(3)
    expect([...logs].sort()).toEqual(['[App] init', '[TodoItem] init Build Lux', '[TodoItem] init Read the plan'])

    logs.length = 0
    await page.click('button.toggle-list')
    await expect(page.locator('main ul')).toHaveCount(0)
    await expect(page.locator('button.toggle-list')).toHaveText('Show list')
    await expect.poll(() => [...logs].sort()).toEqual(['[TodoItem] destroy Build Lux', '[TodoItem] destroy Read the plan'])

    logs.length = 0
    await page.click('button.toggle-list')
    await expect(items(page)).toHaveCount(2)
    await expect.poll(() => logs).toEqual(['[TodoItem] init Read the plan', '[TodoItem] init Build Lux'])
  })
})

test.describe('state options', () => {
  test('persist: todos survive a reload', async ({ page }) => {
    await open(page)
    await addTodo(page, 'Persist me')
    await expect(items(page)).toHaveCount(3)
    await page.reload()
    await expect(items(page)).toHaveText(['Read the plan✕', 'Build Lux✕', 'Persist me✕'])
    expect(JSON.parse((await page.evaluate(() => localStorage.getItem('lux-todos')))!)).toHaveLength(3)
  })

  test('persist: changes sync to another tab', async ({ context }) => {
    const a = await context.newPage()
    const b = await context.newPage()
    await open(a)
    await open(b)

    await addTodo(a, 'From tab A')
    await expect(items(b)).toHaveText(['Read the plan✕', 'Build Lux✕', 'From tab A✕'])

    await items(b).first().locator('input[type=checkbox]').uncheck()
    await expect(items(a).first()).not.toHaveClass(/done/)
    await expect(a.locator('p.count')).toHaveText('3 of 3 left')
  })

  test('url: the filter follows ?filter= and back/forward', async ({ page }) => {
    await open(page)
    const filter = (name: string) => page.locator('button.filter', { hasText: name })

    await filter('done').click()
    await expect(page).toHaveURL(/\?filter=done$/)
    await expect(items(page)).toHaveText(['Read the plan✕'])
    await expect(filter('done')).toHaveClass(/selected/)

    await filter('active').click()
    await expect(page).toHaveURL(/\?filter=active$/)
    await expect(items(page)).toHaveText(['Build Lux✕'])

    await page.goBack()
    await expect(page).toHaveURL(/\?filter=done$/)
    await expect(items(page)).toHaveText(['Read the plan✕'])
    await expect(filter('done')).toHaveClass(/selected/)

    await page.goBack()
    await expect(page).toHaveURL(TODO)
    await expect(items(page)).toHaveCount(2)
    await expect(filter('all')).toHaveClass(/selected/)

    await page.goForward()
    await expect(items(page)).toHaveText(['Read the plan✕'])

    // Loading a URL applies it; an invalid value is rejected by `validate`.
    await open(page, '?filter=active')
    await expect(items(page)).toHaveText(['Build Lux✕'])
    await open(page, '?filter=bogus')
    await expect(items(page)).toHaveCount(2)
    await expect(filter('all')).toHaveClass(/selected/)
  })

  test('debounce: search applies 200 ms after typing stops, replacing the URL', async ({ page }) => {
    await open(page)
    const historyLength = await page.evaluate(() => history.length)
    const search = page.locator('input.search')

    // Type inside the page and check right after the last keystroke, so a slow test runner can't
    // miss the window: the input shows the text, but the list and URL haven't changed yet.
    const pending = await page.evaluate(() => {
      const input = document.querySelector('input.search') as HTMLInputElement
      for (const ch of 'plan') {
        input.value += ch
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return { count: document.querySelectorAll('main ul > li').length, url: location.href }
    })
    expect(pending).toEqual({ count: 2, url: TODO })
    await expect(search).toHaveValue('plan')

    await expect(items(page)).toHaveText(['Read the plan✕'])
    await expect(page).toHaveURL(/\?q=plan$/)
    expect(await page.evaluate(() => history.length)).toBe(historyLength)

    await search.fill('')
    await expect(items(page)).toHaveCount(2)
    await expect(page).toHaveURL(TODO)
  })
})

test.describe('undo / redo', () => {
  test('undo and redo walk the todo history', async ({ page }) => {
    await open(page)
    const undo = page.locator('button.undo')
    const redo = page.locator('button.redo')
    await expect(undo).toBeDisabled()
    await expect(redo).toBeDisabled()

    await addTodo(page, 'One')
    await addTodo(page, 'Two')
    await items(page).first().locator('input[type=checkbox]').uncheck()
    await expect(page.locator('p.count')).toHaveText('4 of 4 left')
    await expect(undo).toBeEnabled()

    await undo.click()
    await expect(page.locator('p.count')).toHaveText('3 of 4 left')
    await undo.click()
    await expect(items(page)).toHaveText(['Read the plan✕', 'Build Lux✕', 'One✕'])
    await expect(redo).toBeEnabled()

    await redo.click()
    await expect(items(page)).toHaveCount(4)
    await redo.click()
    await expect(page.locator('p.count')).toHaveText('4 of 4 left')
    await expect(redo).toBeDisabled()

    // A new change after undo clears the redo stack.
    await undo.click()
    await addTodo(page, 'Three')
    await expect(redo).toBeDisabled()
    await expect(items(page)).toHaveCount(5)
  })
})
