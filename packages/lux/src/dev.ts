// Development-mode warnings. There is a single build of the runtime (so the browser, SSR and
// third-party packages always share one copy); dev mode is a runtime flag instead, which
// @inflector/vite-plugin-lux sets during `vite dev`. Other setups can set it themselves:
// `globalThis.__LUX_DEV__ = true`.

/** True when development warnings are on. */
export function isDev(): boolean {
  return (globalThis as any).__LUX_DEV__ === true
}

const warned = new Set<string>()

/** Log a warning once per message, in development mode only. */
export function warn(message: string): void {
  if (!isDev() || warned.has(message)) return
  warned.add(message)
  console.warn(`[lux] ${message}`)
}
