import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { Loading, derived, lazy, mount, pending, type MountedApp } from '@inflector/keeno'
import { renderToString } from '@inflector/keeno/server'
import { createComponent } from '@inflector/keeno/internal'
import {
  Link,
  Router,
  action,
  httpError,
  invalidate,
  navigate,
  pageRoutes,
  prefetch,
  query,
  type LoadModule,
  type PageModule,
  type PageProps,
  type RouteDefinition,
} from '../src/index'

const tick = () => new Promise((r) => setTimeout(r, 0))
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let app: MountedApp | undefined
beforeEach(() => {
  history.replaceState(null, '', '/')
  invalidate()
})
afterEach(() => {
  app?.destroy()
  app = undefined
  document.body.innerHTML = ''
})

function render(fn: () => unknown) {
  const target = document.createElement('div')
  document.body.appendChild(target)
  app = mount(fn, target)
  return target
}

/** A page that shows its data inside <Loading>. */
const DataPage = (p: PageProps<{ name: string }>) =>
  createComponent(Loading, { fallback: () => 'loading', children: () => () => `user ${p.data.name}` })

describe('query', () => {
  test('shares a request in flight, reuses a result for staleTime, and runs again after invalidate', async () => {
    let calls = 0
    const fn = async () => ++calls
    const [a, b] = await Promise.all([query(['n'], fn), query(['n'], fn)])
    expect([a, b, calls]).toEqual([1, 1, 1])
    expect(await query(['n'], fn)).toBe(2)
    expect(await query(['n'], fn, { staleTime: 10_000 })).toBe(2)
    invalidate(['n'])
    expect(await query(['n'], fn, { staleTime: 10_000 })).toBe(3)
  })

  test('does not cache failures', async () => {
    let calls = 0
    const fn = async () => {
      if (++calls === 1) throw new Error('nope')
      return 'ok'
    }
    await expect(query('f', fn)).rejects.toThrow('nope')
    expect(await query('f', fn)).toBe('ok')
  })

  test('a derived reading a query runs again when a matching prefix is invalidated', async () => {
    let calls = 0
    const el = render(() => {
      const d = derived(() => query(['users', 1], async () => `v${++calls}`))
      return createComponent(Loading, { fallback: () => '…', children: () => () => d.get() })
    })
    await tick()
    expect(el.textContent).toBe('v1')
    invalidate(['other'])
    await tick()
    expect(el.textContent).toBe('v1')
    invalidate(['users'])
    await tick()
    await tick()
    expect(el.textContent).toBe('v2')
  })
})

describe('action', () => {
  test('tracks pending, result and error, and invalidates queries', async () => {
    let calls = 0
    const save = action(async (n: number) => {
      if (n < 0) throw new Error('negative')
      return n * 2
    })
    const el = render(() => {
      const d = derived(() => query('list', async () => `list${++calls}`))
      return createComponent(Loading, {
        fallback: () => '…',
        children: () => () => `${d.get()} ${save.pending ? 'saving' : 'idle'} ${save.result ?? '-'} ${(save.error as Error | undefined)?.message ?? '-'}`,
      })
    })
    await tick()
    expect(el.textContent).toBe('list1 idle - -')
    const p = save(21)
    await tick()
    expect(await p).toBe(42)
    await tick()
    await tick()
    expect(el.textContent).toBe('list2 idle 42 -')
    await save(-1).catch(() => {})
    await tick()
    expect(el.textContent).toBe('list2 idle - negative')
    save.reset()
    await tick()
    expect(el.textContent).toBe('list2 idle - -')
  })

  test('submit passes the form data', async () => {
    let got = null as string | null
    const save = action((data: FormData) => {
      got = data.get('name') as string
    }, { invalidate: false })
    const form = document.createElement('form')
    form.innerHTML = '<input name="name" value="Ada">'
    form.addEventListener('submit', save.submit)
    document.body.appendChild(form)
    form.dispatchEvent(new Event('submit', { cancelable: true }))
    await tick()
    expect(got).toBe('Ada')
  })
})

describe('route load', () => {
  test('passes data to the page, and loads again when the params change', async () => {
    const seen: string[] = []
    const routes: RouteDefinition[] = [
      { path: '/', component: () => 'home' },
      {
        path: '/users/:id',
        component: DataPage as any,
        load: async ({ params, query }) => {
          seen.push(params.id + (query.get('tab') ?? ''))
          await wait(5)
          return { name: `#${params.id}` }
        },
      },
    ]
    const el = render(() => createComponent(Router, { routes }))
    navigate('/users/1')
    await tick()
    expect(el.textContent).toBe('loading')
    await wait(10)
    expect(el.textContent).toBe('user #1')
    navigate('/users/2')
    await tick()
    // The page is kept, showing the previous data until the new one arrives.
    expect(el.textContent).toBe('user #1')
    await wait(10)
    expect(el.textContent).toBe('user #2')
    navigate('/users/2#top')
    await tick()
    navigate('/users/2?tab=x')
    await tick()
    await tick()
    expect(seen).toEqual(['1', '2', '2x'])
  })

  test('starts loading in parallel with the page code', async () => {
    const order: string[] = []
    const routes: RouteDefinition[] = [
      {
        path: '/',
        component: lazy(async () => {
          order.push('code')
          await wait(5)
          return { default: DataPage }
        }),
        load: () => {
          order.push('load')
          return { name: 'x' }
        },
      },
    ]
    const el = render(() => createComponent(Router, { routes }))
    await tick()
    expect(order.sort()).toEqual(['code', 'load'])
    await wait(10)
    expect(el.textContent).toBe('user x')
  })

  test('an httpError thrown by load shows the error page', async () => {
    const routes: RouteDefinition[] = [
      {
        path: '/',
        component: DataPage as any,
        load: () => {
          throw httpError(404)
        },
        errors: { 404: () => 'not found' },
      },
    ]
    const el = render(() => createComponent(Router, { routes }))
    await tick()
    await tick()
    expect(el.textContent).toBe('not found')
  })

  test('actions reload the route data', async () => {
    let n = 0
    const routes: RouteDefinition[] = [{ path: '/', component: DataPage as any, load: () => ({ name: `v${++n}` }) }]
    const save = action(() => {})
    const el = render(() => createComponent(Router, { routes }))
    await tick()
    expect(el.textContent).toBe('user v1')
    await save()
    await tick()
    await tick()
    expect(el.textContent).toBe('user v2')
  })

  test('server rendering waits for the data', async () => {
    const routes: RouteDefinition[] = [
      { path: '/users/:id', component: DataPage as any, load: async ({ params }) => (await wait(5), { name: params.id }) },
    ]
    const html = await renderToString(() => createComponent(Router, { routes, url: '/users/7' }))
    expect(html).toContain('user 7')
  })
})

describe('prefetch', () => {
  test('loads the code and data, and the navigation uses them', async () => {
    let loads = 0
    let code = 0
    const routes: RouteDefinition[] = [
      { path: '/', component: () => 'home' },
      {
        path: '/users/:id',
        component: lazy(async () => (code++, { default: DataPage })),
        load: ({ params }) => (loads++, { name: params.id }),
      },
    ]
    const el = render(() => createComponent(Router, { routes }))
    await prefetch('/users/3')
    expect([code, loads]).toEqual([1, 1])
    navigate('/users/3')
    await tick()
    await tick()
    expect(el.textContent).toBe('user 3')
    expect(loads).toBe(1)
    // The prefetched result is used once: coming back loads again.
    navigate('/')
    await tick()
    navigate('/users/3')
    await tick()
    await tick()
    expect(loads).toBe(2)
  })

  test('<Link prefetch> prefetches on hover, and the Router prop sets the default', async () => {
    const loaded: string[] = []
    const routes: RouteDefinition[] = [
      { path: '/', component: () => createComponent(Link, { href: '/a', children: () => 'a' }) },
      { path: '/a', component: DataPage as any, load: () => (loaded.push('a'), { name: 'a' }) },
    ]
    const el = render(() => createComponent(Router, { routes, prefetch: 'hover' }))
    const a = el.querySelector('a')!
    a.dispatchEvent(new Event('pointerenter'))
    a.dispatchEvent(new Event('pointerleave'))
    await wait(70)
    expect(loaded).toEqual([])
    a.dispatchEvent(new Event('pointerenter'))
    await wait(70)
    expect(loaded).toEqual(['a'])
    a.dispatchEvent(new Event('focus'))
    await tick()
    expect(loaded).toEqual(['a'])
  })

  test('<Link prefetch="eager"> prefetches once mounted; none by default', async () => {
    const loaded: string[] = []
    const routes: RouteDefinition[] = [
      {
        path: '/',
        component: () => [
          createComponent(Link, { href: '/a', prefetch: 'eager', children: () => 'a' }),
          createComponent(Link, { href: '/b', children: () => 'b' }),
        ],
      },
      { path: '/a', component: DataPage as any, load: () => (loaded.push('a'), { name: 'a' }) },
      { path: '/b', component: DataPage as any, load: () => (loaded.push('b'), { name: 'b' }) },
    ]
    const el = render(() => createComponent(Router, { routes }))
    await wait(20)
    el.querySelectorAll('a')[1].dispatchEvent(new Event('pointerenter'))
    await wait(70)
    expect(loaded).toEqual(['a'])
  })

  test('the pending state of route data', async () => {
    let resolve!: () => void
    const routes: RouteDefinition[] = [
      {
        path: '/',
        component: (p: PageProps<string>) => () => (pending(() => p.data) ? 'pending' : 'done'),
        load: () => new Promise<string>((r) => (resolve = () => r('x'))),
      },
    ]
    const el = render(() => createComponent(Router, { routes }))
    await tick()
    expect(el.textContent).toBe('pending')
    resolve()
    await tick()
    await tick()
    expect(el.textContent).toBe('done')
  })
})

describe('pageRoutes', () => {
  test('a `.load.ts` next to a page loads its data', async () => {
    const files: Record<string, PageModule | LoadModule> = {
      '/src/pages/users/[id].kn': { default: DataPage },
      '/src/pages/users/[id].load.ts': async () => ({ load: ({ params }) => ({ name: `file ${params.id}` }) }),
      '/src/pages/index.kn': { default: () => 'home' },
    }
    const routes = pageRoutes(files, '/src/pages')
    expect(routes.map((r) => [r.path, !!r.load])).toEqual([
      ['/users/:id', true],
      ['/', false],
    ])
    history.replaceState(null, '', '/users/5')
    const el = render(() => createComponent(Router, { routes }))
    await tick()
    await tick()
    expect(el.textContent).toBe('user file 5')
  })
})
