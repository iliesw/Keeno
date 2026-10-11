# @inflector/keeno-router

Client-side router for [Keeno](https://github.com/iliesw/Keeno): `<Router>`, `<Link>`, `navigate()`, `useRoute()` and the `link` click handler. It also supports a base path, lazy routes and server rendering.

```bash
bun add @inflector/keeno-router
```

```html
<script lang="ts">
  import { Link, Router } from '@inflector/keeno-router'
  import Home from './Home.kn'
  import User from './User.kn'
  const routes = [
    { path: '/', component: Home },
    { path: '/users/:id', component: User },
  ]
</script>

<Link href="/users/1">Ada</Link>
<Router routes={routes} />
```

See [Routing](https://github.com/iliesw/Keeno/blob/main/docs/routing.md). MIT license.
