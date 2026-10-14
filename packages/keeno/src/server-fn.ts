// server(fn): a function that runs on the server. The compiler (via the Vite plugin) turns each
// call into `server(id)` in the browser build, a stub that POSTs to `{base}_keeno/fn/<id>`, and
// into `server(fn, id)` in the server build, which is the function itself.
import { decode, encode } from './serialize'

/** The path server functions are called at, below the app's base. */
export const SERVER_FN_PATH = '_keeno/fn/'

/** An error from a server function, as the browser sees it: its message and HTTP status. */
export class ServerFunctionError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ServerFunctionError'
  }
}

function stub(id: string) {
  return async (...args: unknown[]) => {
    const base: string = (globalThis as { __KEENO_BASE__?: string }).__KEENO_BASE__ ?? '/'
    const form = args.length === 1 && typeof FormData !== 'undefined' && args[0] instanceof FormData
    const headers: Record<string, string> = { 'x-keeno-fn': '1' }
    if (!form) headers['content-type'] = 'application/json'
    const res = await fetch(base + SERVER_FN_PATH + id, {
      method: 'POST',
      headers,
      body: form ? (args[0] as FormData) : JSON.stringify(encode(args)),
    })
    const text = await res.text()
    let body: unknown
    try {
      body = text ? decode(JSON.parse(text)) : undefined
    } catch {
      body = undefined
    }
    if (!res.ok) {
      const message = (body as { message?: unknown } | undefined)?.message
      throw new ServerFunctionError(typeof message === 'string' ? message : `HTTP ${res.status}`, res.status)
    }
    return body
  }
}

/**
 * A function that runs on the server: `const getPost = server(async (id: string) => db.posts.find(id))`.
 * Call it from anywhere, in the browser it sends a request. It can use its arguments, imports and
 * module-level code, but not the variables of a component (pass them as arguments). Arguments and
 * results can be JSON, Dates, Maps, Sets, BigInts, undefined, or a single `FormData`. An error it
 * throws arrives with its message and `status` (`httpError(404)`: 404; other errors: 500, and
 * the message only in development).
 */
export function server<F extends (...args: any[]) => Promise<any>>(fn: F): F
export function server(fn: unknown, id?: string): unknown {
  // The browser build: `server(id)`.
  if (typeof fn === 'string') return stub(fn)
  // The server build (`server(fn, id)`), or code the compiler didn't see: the function itself.
  if (typeof fn !== 'function') throw new TypeError('[keeno] server() takes a function')
  void id
  return fn
}
