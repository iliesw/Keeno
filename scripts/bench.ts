// Rendering benchmarks in headless Chromium, modelled on js-framework-benchmark: build the fixture
// app for production, serve it, and time each operation on the /bench table from the click to the
// next frame (DOM updates, style, layout and paint included).
//
//   bun run bench [--runs=10] [--json=results.json]
import { $ } from 'bun'
import { chromium, type Page } from '@playwright/test'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const runs = Number(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) ?? 10)
const jsonOut = process.argv.find((a) => a.startsWith('--json='))?.slice(7)
const outDir = path.join(tmpdir(), 'keeno-bench')

console.log('[bench] building the fixture app for production')
rmSync(outDir, { recursive: true, force: true })
await $`bunx --bun vite build --outDir ${outDir} --emptyOutDir --logLevel error`.cwd(path.join(root, 'e2e/app'))

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const file = path.join(outDir, new URL(req.url).pathname)
    if (existsSync(file) && !file.endsWith(path.sep) && path.extname(file)) return new Response(Bun.file(file))
    return new Response(readFileSync(path.join(outDir, 'index.html')), { headers: { 'content-type': 'text/html' } })
  },
})
const url = `http://localhost:${server.port}/bench`

/** Click `selector` and resolve with the time until the next frame has been produced. */
async function timeClick(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) =>
      new Promise<number>((resolve) => {
        const el = document.querySelector(sel) as HTMLElement
        const start = performance.now()
        el.click()
        requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)))
      }),
    selector,
  )
}

interface Op {
  name: string
  /** Bring the table into the state the operation starts from. */
  setup: (page: Page) => Promise<void>
  click: string
}

const clickAll = async (page: Page, ...selectors: string[]) => {
  for (const s of selectors) await page.click(s)
}

const ops: Op[] = [
  { name: 'create 1,000 rows', setup: (p) => clickAll(p, '#clear'), click: '#run' },
  { name: 'replace 1,000 rows', setup: (p) => clickAll(p, '#run'), click: '#run' },
  { name: 'update every 10th row', setup: (p) => clickAll(p, '#run'), click: '#update' },
  { name: 'select row', setup: (p) => clickAll(p, '#run'), click: '#tbody tr:nth-child(2) td:nth-child(2) a' },
  { name: 'swap rows', setup: (p) => clickAll(p, '#run'), click: '#swaprows' },
  { name: 'remove row', setup: (p) => clickAll(p, '#run'), click: '#tbody tr:nth-child(4) a.remove' },
  { name: 'create 10,000 rows', setup: (p) => clickAll(p, '#clear'), click: '#runlots' },
  { name: 'append 1,000 rows', setup: (p) => clickAll(p, '#clear', '#run'), click: '#add' },
  { name: 'clear 1,000 rows', setup: (p) => clickAll(p, '#run'), click: '#clear' },
]

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

const browser = await chromium.launch()
const results: { name: string; median: number; min: number; max: number }[] = []
try {
  for (const op of ops) {
    const times: number[] = []
    // A fresh page per operation, with one warm-up run that isn't counted.
    const page = await browser.newPage()
    await page.goto(url)
    await page.waitForSelector('#run')
    for (let i = 0; i <= runs; i++) {
      await op.setup(page)
      const t = await timeClick(page, op.click)
      if (i > 0) times.push(t)
    }
    await page.close()
    results.push({ name: op.name, median: median(times), min: Math.min(...times), max: Math.max(...times) })
    console.log(`${op.name.padEnd(24)} ${median(times).toFixed(1).padStart(8)} ms   (min ${Math.min(...times).toFixed(1)}, max ${Math.max(...times).toFixed(1)})`)
  }
  const memPage = await browser.newPage()
  await memPage.goto(url)
  await clickAll(memPage, '#run')
  const heap = await memPage.evaluate(() => (performance as any).memory?.usedJSHeapSize as number | undefined)
  if (heap) console.log(`${'heap after 1,000 rows'.padEnd(24)} ${(heap / 1048576).toFixed(1).padStart(8)} MB`)
} finally {
  await browser.close()
  server.stop()
  rmSync(outDir, { recursive: true, force: true })
}

if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ date: new Date().toISOString(), runs, results }, null, 2))
