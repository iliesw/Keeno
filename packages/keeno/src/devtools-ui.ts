// In-page dev tools panel: `import '@inflector/keeno/devtools'` (the Vite plugin adds it during
// `vite dev`). Alt+Shift+D toggles the panel, Alt+Shift+C picks a component on the page.
//
// The panel is a Keeno app: its components are in devtools/ui/*.kn, compiled into devtools/gen/ by
// `bun run devtools`. It renders into a shadow root (so the app's CSS doesn't reach it), reads
// the app through `__KEENO_DEVTOOLS__` (devtools.ts), and is mounted with `mountDevtools`, which
// hides it from the dev tools themselves.
import { mountDevtools } from './component'
import Panel from './devtools/gen/Panel'
import { COMPONENT_CSS } from './devtools/gen/styles'
import { BASE_CSS } from './devtools/styles'

const g = globalThis as any

function boot() {
  // On <html>, so apps that replace the content of <body> don't remove it.
  const host = document.createElement('keeno-devtools')
  host.setAttribute('style', 'all: initial; position: fixed; z-index: 2147483646; top: 0; left: 0; width: 0; height: 0;')
  const root = host.attachShadow({ mode: 'open' })
  const style = document.createElement('style')
  style.textContent = BASE_CSS + COMPONENT_CSS
  root.append(style)
  document.documentElement.append(host)
  mountDevtools(Panel, root, { host })
}

// Browsers driven by test tools (Playwright, WebDriver) don't get the panel: their selectors see
// into open shadow roots, and the panel would show up in the app's end-to-end tests.
const automated = typeof navigator !== 'undefined' && navigator.webdriver === true && !g.__KEENO_DEVTOOLS_FORCE__
if (typeof window !== 'undefined' && typeof document !== 'undefined' && !automated && !g.__KEENO_DEVTOOLS_UI__) {
  g.__KEENO_DEVTOOLS_UI__ = true
  let booted = false
  const tryBoot = () => {
    if (booted || !(g.__KEENO_DEVTOOLS__?.version >= 2)) return
    booted = true
    if (document.body) boot()
    else document.addEventListener('DOMContentLoaded', boot, { once: true })
  }
  tryBoot()
  window.addEventListener('keeno:devtools', tryBoot)
}
