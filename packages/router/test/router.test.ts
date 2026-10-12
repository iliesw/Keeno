import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { init, mount, type MountedApp } from '@inflector/keeno'
import { renderToString } from '@inflector/keeno/server'
import { createComponent } from '@inflector/keeno/internal'
import { Link, Router, href, isActive, link, matchPath, navigate, useRoute, type RouteDefinition } from '../src/index'

const tick = () => new Promise((r) => setTimeout(r, 0))

let app: MountedApp | undefined
beforeEach(() => history.replaceState(null, '', '/'))
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

describe('matchPath', () => {
  test('static, params, rest', () => {
    expect(matchPath('/', '/')).toEqual({})
    expect(matchPath('/about', '/about/')).toEqual({})
    expect(matchPath('/about', '/')).toBeNull()
    expect(matchPath('/users/:id', '/users/42')).toEqual({ id: '42' })
    expect(matchPath('/users/:id', '/users/42/posts')).toBeNull()
    expect(matchPath('/files/*path', '/files/a/b%20c')).toEqual({ path: 'a/b c' })
    expect(matchPath('*', '/anything/here')).toEqual({ '*': 'anything/here' })
    expect(matchPath('/a/:x', '/a/%E0%A4%A')).toEqual({ x: '%E0%A4%A' })
  })
})

describe('Router', () => {
  const created: string[] = []
  const Home = () => 'home'
  const User = (p: { params: { id: string } }) => {
    created.push('User')
    return () => `user ${p.params.id}`
  }
  const NotFound = () => {
    const route = useRoute()
    return () => `404 ${route.path}`
  }
  const routes: RouteDefinition[] = [
    { path: '/', component: Home },
    { path: '/users/:id', component: User as any },
    { path: '*', component: NotFound },
  ]

  test('renders the matching route and follows navigation and back/forward', async () => {
    created.length = 0
    const el = render(() => createComponent(Router, { routes }))
    expect(el.textContent).toBe('home')
    navigate('/users/1')
    await tick()
    expect(location.pathname).toBe('/users/1')
    expect(el.textContent).toBe('user 1')
    navigate('/users/2')
    await tick()
    expect(el.textContent).toBe('user 2')
    expect(created).toEqual(['User']) // same route: instance kept, params updated
    navigate('/nope')
    await tick()
    expect(el.textContent).toBe('404 /nope')
    // Back/forward: the browser changes the URL, then fires popstate.
    history.replaceState(null, '', '/users/2')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await tick()
    expect(el.textContent).toBe('user 2')
  })

  test('base path', async () => {
    history.replaceState(null, '', '/app/users/7')
    const el = render(() => createComponent(Router, { routes, base: '/app/' }))
    expect(el.textContent).toBe('user 7')
    navigate('/')
    await tick()
    expect(location.pathname).toBe('/app/')
    expect(el.textContent).toBe('home')
  })

  test('query and hash on the route', async () => {
    let seen = ''
    const Show = () => {
      const route = useRoute()
      return () => (seen = `${route.query.get('q')}|${route.hash}`)
    }
    render(() => createComponent(Router, { routes: [{ path: '*', component: Show }] }))
    navigate('/search?q=keeno#top')
    await tick()
    expect(seen).toBe('keeno|#top')
  })

  test('useRoute outside a router is an error', () => {
    expect(() => render(() => createComponent(() => useRoute(), {}))).toThrow('inside a <Router>')
  })

  test('server rendering uses the `url` prop', async () => {
    const html = await renderToString(() => createComponent(Router, { routes, url: '/users/9?x=1' }))
    expect(html).toBe('user 9')
  })
})

describe('links', () => {
  test('<Link> navigates, marks itself active, and leaves modified clicks alone', async () => {
    const el = render(() => [
      createComponent(Link, { href: '/users/1', class: 'nav', children: () => 'one' }),
      createComponent(Link, { href: '/', exact: true, children: () => 'home' }),
    ])
    const [one, home] = [...el.querySelectorAll('a')]
    expect(one.getAttribute('href')).toBe('/users/1')
    expect(one.className).toBe('nav')
    expect(home.className).toBe('active')
    one.click()
    await tick()
    expect(location.pathname).toBe('/users/1')
    expect(one.className).toBe('nav active')
    expect(one.getAttribute('aria-current')).toBe('page')
    expect(home.hasAttribute('class')).toBe(false)

    const e = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true })
    home.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })

  test("<Link> gets the scope class of the component that renders it", () => {
    const el = render(() => [
      createComponent(Link, { href: '/', class: 'nav', children: () => 'home' }, 'keeno-abc'),
      createComponent(Link, { href: '/x', children: () => 'x' }, 'keeno-abc'),
    ])
    const [home, x] = [...el.querySelectorAll('a')]
    expect(home.className).toBe('nav active keeno-abc')
    expect(x.className).toBe('keeno-abc')
  })

  test('the link handler works on plain anchors', async () => {
    const el = render(() => {
      const a = document.createElement('a')
      a.href = '/about?x=1'
      a.textContent = 'about'
      a.addEventListener('click', link)
      return a
    })
    el.querySelector('a')!.click()
    await tick()
    expect(location.pathname + location.search).toBe('/about?x=1')
    expect(isActive('/about')).toBe(true)
  })

  test('route components can use init', async () => {
    let mounted = 0
    const Page = () => {
      init(() => void mounted++)
      return 'page'
    }
    render(() => createComponent(Router, { routes: [{ path: '/', component: Page }] }))
    await tick()
    expect(mounted).toBe(1)
  })
})

describe('regressions', () => {
  test('href() never produces a protocol-relative URL', () => {
    expect(href('//evil.com')).toBe('/evil.com')
  })

  test('navigate() does not fire popstate', () => {
    let pops = 0
    const onPop = () => pops++
    window.addEventListener('popstate', onPop)
    navigate('/somewhere')
    window.removeEventListener('popstate', onPop)
    expect(pops).toBe(0)
  })

  test('server-rendered links use their router base', async () => {
    const html = await renderToString(() =>
      createComponent(Router, {
        url: '/app/a',
        base: '/app',
        routes: [{ path: '/a', component: () => createComponent(Link, { href: '/b', children: () => 'b' }) }],
      }),
    )
    expect(html).toContain('href="/app/b"')
  })

  test('URLs outside the base match nothing', async () => {
    history.replaceState(null, '', '/other/users/7')
    const el = render(() => createComponent(Router, { routes: [{ path: '*', component: () => 'app' }], base: '/app', fallback: () => 'none' }))
    expect(el.textContent).toBe('none')
  })
})

describe('scroll restoration', () => {
  test('back/forward restores the scroll position of the entry', async () => {
    history.replaceState(null, '', '/list')
    render(() => createComponent(Router, { routes: [{ path: '*', component: () => 'page' }] }))
    const calls: [number, number][] = []
    const scrollTo = window.scrollTo
    const y = Object.getOwnPropertyDescriptor(window, 'scrollY')
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true })
    window.scrollTo = ((x: number, yy: number) => void calls.push([x, yy])) as unknown as typeof window.scrollTo
    try {
      navigate('/detail')
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
      history.replaceState(null, '', '/list')
      window.dispatchEvent(new PopStateEvent('popstate'))
      await new Promise((r) => setTimeout(r, 50))
      expect(calls.at(-1)).toEqual([0, 420])
    } finally {
      window.scrollTo = scrollTo
      if (y) Object.defineProperty(window, 'scrollY', y)
    }
  })
})

describe('view transitions', () => {
  const routes: RouteDefinition[] = [
    { path: '/', component: () => 'home' },
    { path: '/about', component: () => 'about' },
  ]
  let calls: string[] = []
  const install = () => {
    calls = []
    ;(document as any).startViewTransition = (cb: () => void) => {
      calls.push('start')
      // The browser calls back after capturing the old page: the new one must be rendered when it returns.
      queueMicrotask(() => {
        cb()
        calls.push(`rendered: ${document.body.textContent}`)
      })
      return {}
    }
  }
  afterEach(() => {
    delete (document as any).startViewTransition
  })

  test('<Router viewTransition> renders navigations inside startViewTransition', async () => {
    install()
    render(() => createComponent(Router, { routes, viewTransition: true }))
    navigate('/about')
    await tick()
    expect(calls).toEqual(['start', 'rendered: about'])
    navigate('/', { transition: false })
    await tick()
    expect(calls.length).toBe(2)
    expect(document.body.textContent).toBe('home')
  })

  test('Link can opt in per link', async () => {
    install()
    const el = render(() => [
      createComponent(Router, { routes }),
      createComponent(Link, { href: '/about', transition: true, children: () => 'go' }),
    ])
    el.querySelector('a')!.click()
    await tick()
    expect(calls).toEqual(['start', 'rendered: aboutgo'])
    navigate('/')
    await tick()
    expect(calls.length).toBe(2) // no default: plain navigation
  })

  test('back and forward transition with <Router viewTransition>', async () => {
    install()
    render(() => createComponent(Router, { routes, viewTransition: true }))
    history.pushState(null, '', '/about')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await tick()
    expect(calls).toEqual(['start', 'rendered: about'])
  })

  test('without the API, navigation works as before', async () => {
    const el = render(() => createComponent(Router, { routes, viewTransition: true }))
    navigate('/about')
    await tick()
    expect(el.textContent).toBe('about')
  })
})
