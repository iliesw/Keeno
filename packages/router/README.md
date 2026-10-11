# @inflector/lux-router

Client-side router for [Lux](https://github.com/iliesw/Lux): `<Router>`, `<Link>`, `navigate()`, `useRoute()` and the `link` click handler. It also supports a base path, lazy routes and server rendering.

```bash
bun add @inflector/lux-router
```

```html
<script lang="ts">
  import { Link, Router } from '@inflector/lux-router'
  import Home from './Home.lx'
  import User from './User.lx'
  const routes = [
    { path: '/', component: Home },
    { path: '/users/:id', component: User },
  ]
</script>

<Link href="/users/1">Ada</Link>
<Router routes={routes} />
```

See [Routing](https://github.com/iliesw/Lux/blob/main/docs/routing.md). MIT license.
