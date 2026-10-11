// Development-mode warnings. There is a single build of the runtime (so the browser, SSR and
// third-party packages always share one copy); dev mode is a runtime flag instead, which
// @inflector/vite-plugin-keeno sets during `vite dev`. Other setups can set it themselves:
// `globalThis.__KEENO_DEV__ = true`.

/** True when development warnings are on. */
export function isDev(): boolean {
  return (globalThis as any).__KEENO_DEV__ === true
}

const warned = new Set<string>()

/** Log a warning once per message, in development mode only. */
export function warn(message: string): void {
  if (!isDev() || warned.has(message)) return
  warned.add(message)
  console.warn(`[keeno] ${message}`)
}

/**
 * Instrumentation used by the dev tools (see devtools.ts). Null unless the dev tools hook is
 * installed, so production code pays one null check at each call site.
 */
export interface DevHook {
  /** A `state()` or `derived()` was created. */
  signal(s: object): void
  /** A state's value changed. */
  write(s: object, old: unknown, next: unknown, source: string): void
  /** A computation ran. */
  run(c: object): void
  /** An error was passed to `handleError`. */
  error(err: unknown, owner: object | null): void
  /** A component instance was created; `out` is what it rendered. */
  component(owner: object, out: unknown): void
  /** A flush ended after `ms` milliseconds. */
  flush(ms: number): void
}

export let devHook: DevHook | null = null

/** @internal */
export function setDevHook(h: DevHook | null): void {
  devHook = h
}
