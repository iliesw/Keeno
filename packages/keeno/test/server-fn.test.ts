import { afterEach, describe, expect, test } from 'bun:test'
import { server, ServerFunctionError } from '../src/index'
import { getRequest, handleServerFunction, setHeader, type ServerFunctionModules } from '../src/server'
import { decode, encode } from '../src/serialize'

const roundTrip = (v: unknown) => decode(JSON.parse(JSON.stringify(encode(v))))

describe('serialize', () => {
  test('keeps the types JSON loses', () => {
    const value = {
      date: new Date(5),
      map: new Map<unknown, unknown>([[1, { a: new Set([2n]) }]]),
      nothing: undefined,
      nums: [NaN, Infinity, -Infinity, -0, 1.5],
      re: /a+/gi,
      url: new URL('https://example.com/x'),
      tricky: { $k: 'Date', v: 1 },
    }
    const out = roundTrip(value) as typeof value
    expect(out.date).toEqual(new Date(5))
    expect(out.map.get(1)).toEqual({ a: new Set([2n]) })
    expect('nothing' in out && out.nothing === undefined).toBe(true)
    expect(Object.is(out.nums[3], -0)).toBe(true)
    expect(out.nums.slice(0, 3)).toEqual([NaN, Infinity, -Infinity])
    expect(out.re).toEqual(/a+/gi)
    expect(out.url.href).toBe('https://example.com/x')
    expect(out.tricky).toEqual({ $k: 'Date', v: 1 })
  })

  test('rejects functions and cycles; never sets a prototype', () => {
    expect(() => encode({ f() {} })).toThrow("can't be sent")
    const cyclic: any = {}
    cyclic.self = cyclic
    expect(() => encode(cyclic)).toThrow('cycle')
    const out = decode(JSON.parse('{"__proto__": {"polluted": true}}')) as any
    expect(({} as any).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype)
  })
})

describe('handleServerFunction', () => {
  const calls: unknown[][] = []
  const modules: ServerFunctionModules = {
    mod: async () => ({
      $$serverFns: {
        0: async (a: Date, b: Map<string, number>) => {
          calls.push([a, b])
          return { at: a, size: b.size, none: undefined }
        },
        1: async () => {
          const err: any = new Error('missing')
          err.status = 404
          throw err
        },
        2: async () => {
          throw new Error('db password is hunter2')
        },
        3: async (form: FormData) => `hi ${form.get('name')}`,
        4: async () => {
          setHeader('x-a', '1')
          setHeader('x-a', '2')
          return getRequest().headers.get('x-user')
        },
      },
    }),
  }
  const call = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    handleServerFunction(
      new Request('http://app.test' + path, {
        method: 'POST',
        ...init,
        headers: { 'x-keeno-fn': '1', 'content-type': 'application/json', ...init.headers },
      }),
      modules,
    )
  const body = (args: unknown[]) => JSON.stringify(encode(args))
  const read = async (res: Response | null) => decode(JSON.parse(await res!.text()))

  test('calls the function with its arguments and sends back the result', async () => {
    const res = await call('/_keeno/fn/mod/0', { body: body([new Date(1), new Map([['x', 1]])]) })
    expect(res!.status).toBe(200)
    expect(await read(res)).toEqual({ at: new Date(1), size: 1, none: undefined })
    expect(calls.at(-1)![0]).toBeInstanceOf(Date)
  })

  test('form data, request headers and response headers', async () => {
    const form = new FormData()
    form.set('name', 'Ada')
    const res = await handleServerFunction(
      new Request('http://app.test/_keeno/fn/mod/3', { method: 'POST', body: form, headers: { 'x-keeno-fn': '1' } }),
      modules,
    )
    expect(await read(res)).toBe('hi Ada')
    const res2 = await call('/_keeno/fn/mod/4', { body: '[]', headers: { 'x-user': 'ada' } })
    expect(await read(res2)).toBe('ada')
    expect(res2!.headers.get('x-a')).toBe('1, 2')
  })

  test('errors keep their status; 500 messages stay on the server unless dev', async () => {
    const notFound = await call('/_keeno/fn/mod/1', { body: '[]' })
    expect(notFound!.status).toBe(404)
    expect(await read(notFound)).toEqual({ message: 'missing' })
    const log = console.error
    console.error = () => {}
    try {
      const hidden = await call('/_keeno/fn/mod/2', { body: '[]' })
      expect(hidden!.status).toBe(500)
      expect(await read(hidden)).toEqual({ message: 'Internal Server Error' })
      const dev = await handleServerFunction(
        new Request('http://app.test/_keeno/fn/mod/2', { method: 'POST', body: '[]', headers: { 'x-keeno-fn': '1' } }),
        modules,
        { dev: true },
      )
      expect(((await read(dev)) as { message: string }).message).toBe('db password is hunter2')
    } finally {
      console.error = log
    }
  })

  test('refuses other sites, other methods, unknown functions and bad arguments', async () => {
    expect((await call('/_keeno/fn/mod/0', { body: '[]', headers: { 'x-keeno-fn': '' } }))!.status).toBe(403)
    // A plain object: the test DOM's Request drops the Origin header, as browsers do.
    const fromOrigin = (origin: string) =>
      handleServerFunction(
        {
          url: 'http://app.test/_keeno/fn/mod/0',
          method: 'POST',
          headers: new Map([['x-keeno-fn', '1'], ['origin', origin]]),
          text: async () => body([new Date(1), new Map()]),
        } as unknown as Request,
        modules,
      )
    expect((await fromOrigin('https://evil.test'))!.status).toBe(403)
    expect((await fromOrigin('http://app.test'))!.status).toBe(200)
    expect((await handleServerFunction(new Request('http://app.test/_keeno/fn/mod/0'), modules))!.status).toBe(405)
    expect((await call('/_keeno/fn/mod/9', { body: '[]' }))!.status).toBe(404)
    expect((await call('/_keeno/fn/nope/0', { body: '[]' }))!.status).toBe(404)
    expect((await call('/_keeno/fn/mod/toString', { body: '[]' }))!.status).toBe(404)
    expect((await call('/_keeno/fn/mod/0', { body: '{"a":1}' }))!.status).toBe(400)
    expect(await call('/other', { body: '[]' })).toBeNull()
  })
})

describe('server() in the browser', () => {
  const realFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = realFetch
    delete (globalThis as any).__KEENO_BASE__
  })

  test('outside the compiler, it is the function itself', async () => {
    const fn = server(async (n: number) => n * 2)
    expect(await fn(2)).toBe(4)
  })

  test('a stub posts the arguments to the handler and decodes the answer', async () => {
    ;(globalThis as any).__KEENO_BASE__ = '/app/'
    const modules: ServerFunctionModules = { m: async () => ({ $$serverFns: { 0: async (d: Date) => new Map([['y', d.getUTCFullYear()]]) } }) }
    let seen = ''
    globalThis.fetch = (async (input: string, init: RequestInit) => {
      seen = input
      return (await handleServerFunction(new Request('http://localhost' + input, init), modules, { base: '/app/' }))!
    }) as typeof fetch
    const stub = (server as unknown as (id: string) => (d: Date) => Promise<Map<string, number>>)('m/0')
    expect(await stub(new Date(Date.UTC(2026, 0, 1)))).toEqual(new Map([['y', 2026]]))
    expect(seen).toBe('/app/_keeno/fn/m/0')
  })

  test('a failed call throws a ServerFunctionError with the status', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ message: 'nope' }), { status: 403 })) as unknown as typeof fetch
    const stub = (server as unknown as (id: string) => () => Promise<void>)('m/0')
    const err = await stub().catch((e) => e)
    expect(err).toBeInstanceOf(ServerFunctionError)
    expect(err.status).toBe(403)
    expect(err.message).toBe('nope')
  })
})
