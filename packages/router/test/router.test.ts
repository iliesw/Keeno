import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { init, mount, type MountedApp } from '@inflector/lux'
import { renderToString } from '@inflector/lux/server'
import { createComponent } from '@inflector/lux/internal'
import { Link, Router, isActive, link, matchPath, navigate, useRoute, type RouteDefinition } from '../src/index'

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
    navigate('/search?q=lux#top')
    await tick()
    expect(seen).toBe('lux|#top')
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
      createComponent(Link, { href: '/', class: 'nav', children: () => 'home' }, 'lux-abc'),
      createComponent(Link, { href: '/x', children: () => 'x' }, 'lux-abc'),
    ])
    const [home, x] = [...el.querySelectorAll('a')]
    expect(home.className).toBe('nav active lux-abc')
    expect(x.className).toBe('lux-abc')
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
