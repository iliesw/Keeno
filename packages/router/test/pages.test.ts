import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mount, type Children, type MountedApp } from '@inflector/keeno'
import { createComponent } from '@inflector/keeno/internal'
import { Router, httpError, navigate, pageRoutes, preloadRoute, type ErrorPageProps, type PageModule } from '../src/index'

const tick = () => new Promise((r) => setTimeout(r, 0))

let app: MountedApp | undefined
beforeEach(() => history.replaceState(null, '', '/'))
afterEach(() => {
  app?.destroy()
  app = undefined
  document.body.innerHTML = ''
})

const created: string[] = []
/** A page module whose component renders `text` (a function of params). */
const page = (name: string, text: (p: any) => string = () => name): PageModule => ({
  default: (p: any) => {
    created.push(name)
    return () => text(p.params)
  },
})
const layout = (name: string): PageModule => ({
  default: (p: { children: Children }) => {
    created.push(name)
    const el = document.createElement('div')
    el.className = name
    // Mirror what `{children}` compiles to: a reactive insert.
    mount(() => p.children, el)
    return el
  },
})
const errorPage = (name: string): PageModule => ({
  default: (p: ErrorPageProps) => () => `${name} ${p.status}`,
})

const files: Record<string, PageModule> = {
  '/src/pages/index.kn': page('home'),
  '/src/pages/about.kn': page('about'),
  '/src/pages/_layout.kn': layout('root'),
  '/src/pages/_404.kn': errorPage('not-found'),
  '/src/pages/_500.kn': errorPage('error'),
  '/src/pages/_Helper.kn': page('helper'),
  '/src/pages/users/[id].kn': page('user', (p) => `user ${p.id}`),
  '/src/pages/users/new.kn': page('new-user'),
  '/src/pages/users/_layout.kn': layout('users'),
  '/src/pages/users/_404.kn': errorPage('no-user'),
  '/src/pages/secret.kn': {
    default: () => {
      throw httpError(403)
    },
  },
  '/src/pages/broken.kn': {
    default: () => {
      throw new Error('boom')
    },
  },
  '/src/pages/docs/_all.kn': page('docs', (p) => `docs ${p['*']}`),
  '/src/pages/docs/intro.kn': page('intro'),
}

describe('pageRoutes', () => {
  test('maps files to paths, most specific first', () => {
    const routes = pageRoutes(files, '/src/pages')
    const paths = routes.map((r) => r.path)
    expect([...paths].sort()).toEqual(
      ['/', '/*', '/about', '/broken', '/docs/*', '/docs/intro', '/secret', '/users/*', '/users/:id', '/users/new'].sort(),
    )
    const before = (a: string, b: string) => expect(paths.indexOf(a)).toBeLessThan(paths.indexOf(b))
    before('/users/new', '/users/:id')
    before('/users/:id', '/users/*')
    before('/docs/intro', '/docs/*')
    before('/users/*', '/*')
    before('/', '/*')
    expect(paths.at(-1)).toBe('/*')
    const user = routes.find((r) => r.path === '/users/:id')!
    expect(user.layouts?.length).toBe(2)
    expect(Object.keys(user.errors!)).toEqual(['404', '500'])
    expect(routes.find((r) => r.path === '/about')!.layouts?.length).toBe(1)
  })

  test('lazy pages, and preloadRoute', async () => {
    const loaded: string[] = []
    const lazyPage = (name: string) => () => (loaded.push(name), Promise.resolve(page(name) as any))
    const routes = pageRoutes({ '/p/index.kn': lazyPage('home'), '/p/about.kn': lazyPage('about') }, '/p')
    expect(routes.map((r) => r.path)).toEqual(['/about', '/'])
    await preloadRoute(routes, '/about?x=1')
    await preloadRoute(routes, '/nothing')
    expect(loaded).toEqual(['about'])
    // Loaded: renders in the first pass.
    const target = document.createElement('div')
    history.replaceState(null, '', '/about')
    app = mount(() => createComponent(Router, { routes }), target)
    expect(target.textContent).toBe('about')
  })
})

describe('file routes in <Router>', () => {
  const routes = pageRoutes(files, '/src/pages')
  function render() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    app = mount(() => createComponent(Router, { routes }), target)
    return target
  }

  test('pages render inside their layouts, which persist across navigation', async () => {
    created.length = 0
    const el = render()
    expect(el.querySelector('.root')!.textContent).toBe('home')
    navigate('/about')
    await tick()
    expect(el.textContent).toBe('about')
    navigate('/users/1')
    await tick()
    expect(el.querySelector('.root .users')!.textContent).toBe('user 1')
    navigate('/users/2')
    await tick()
    expect(el.textContent).toBe('user 2')
    navigate('/users/new')
    await tick()
    expect(el.textContent).toBe('new-user')
    expect(created).toEqual(['root', 'home', 'about', 'users', 'user', 'new-user'])
  })

  test('404 pages, nearest directory first', async () => {
    const el = render()
    navigate('/nope/deep')
    await tick()
    expect(el.querySelector('.root')!.textContent).toBe('not-found 404')
    navigate('/users/1/posts')
    await tick()
    expect(el.querySelector('.users')!.textContent).toBe('no-user 404')
  })

  test('_all catches the rest of its directory', async () => {
    const el = render()
    navigate('/docs/a/b')
    await tick()
    expect(el.textContent).toBe('docs a/b')
    navigate('/docs/intro')
    await tick()
    expect(el.textContent).toBe('intro')
  })

  test('thrown errors render the page for their status, and navigation clears them', async () => {
    const el = render()
    navigate('/broken')
    await tick()
    expect(el.textContent).toBe('error 500')
    navigate('/about')
    await tick()
    expect(el.textContent).toBe('about')
    // No `_403.kn`: the error goes on to the next boundary, here mount() itself.
    let thrown: unknown
    const onError = (e: ErrorEvent) => {
      thrown = e.error
      e.preventDefault()
    }
    window.addEventListener('error', onError)
    try {
      navigate('/secret')
      await tick()
    } catch (e) {
      thrown = e
    } finally {
      window.removeEventListener('error', onError)
    }
    expect((thrown as any)?.status).toBe(403)
  })
})
