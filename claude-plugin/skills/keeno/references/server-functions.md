# Server functions

Wrap an async function in `server(…)` and it runs on the server. Call it like any other function. In the browser the call becomes a request, and the result comes back with its types. You don't write an API route, a `fetch` or JSON parsing.

```html Post.kn
<script lang="ts">
  import { navigate } from '@inflector/keeno-router'
  import { db } from '../db'   // only used inside server(): never sent to the browser

  const { params } = props<{ params: { id: string } }>()

  const getPost = server(async (id: string) => {
    return db.posts.find(id)
  })

  const like = server(async (id: string) => {
    return db.posts.increment(id, 'likes')   // the new count
  })

  const remove = server(async (id: string) => {
    await db.posts.delete(id)
  })

  const post = derived(() => getPost(params.id))
  const likes = state(0)

  async function onLike() {
    likes.set(await like(params.id))
  }

  async function onDelete() {
    await remove(params.id)
    navigate('/posts')
  }
</script>

<Loading fallback={() => <p>Loading…</p>}>
  <h1>{post.title}</h1>
  <p>{post.body}</p>
  <button onClick={onLike}>♥ {likes || post.likes}</button>
  <button onClick={onDelete}>Delete</button>
</Loading>
```

`server` needs no import in a `.kn` file, like `state` and `derived`. It works with the Vite plugin, in `vite dev` and in a production build.

## The one rule

A server function runs on the server, apart from the component. It can use:

- its arguments,
- imports,
- module-level code in a `.ts` file,
- globals (`process.env`, `fetch`, …).

It can't use the component's variables (its states, props or local functions). Pass what it needs as arguments. If it does use one, the compiler tells you:

```
server() can't use `count`: it runs on the server, so pass it as an argument
```

Everything that only server functions use, such as the `db` import above, is left out of the browser bundle. That keeps database clients, secrets and Node-only modules on the server.

## In `.ts` files

Import `server` from `@inflector/keeno` and export the functions. Share them between components, or use them in a page's [`load`](routing.md#loading-data):

```ts src/lib/posts.ts
import { server } from '@inflector/keeno'
import { db } from './db'

export const getPost = server(async (id: string) => db.posts.find(id))
export const listPosts = server(async () => db.posts.all())
```

```ts src/pages/posts/[id].load.ts
import { getPost } from '../../lib/posts'

export const load = ({ params }) => getPost(params.id)
```

During server rendering, a server function is called directly, with no request.

## Arguments and results

These can be JSON values, plus `Date`, `Map`, `Set`, `BigInt`, `undefined`, `NaN`, `Infinity`, `RegExp` and `URL`, nested anywhere. A single `FormData` argument is sent as a form, files included, which suits [`action()`](routing.md#actions):

```ts
const save = action(server(async (form: FormData) => { … }))
```

```html
<form onSubmit={save.submit}>…</form>
```

Class instances arrive as plain objects. Functions, symbols and objects with cycles can't be sent.

## Errors

An error thrown by a server function is thrown where it was called, as a `ServerFunctionError` with the HTTP `status`:

- `throw httpError(404)` (from `@inflector/keeno-router`), or any error with a numeric `status`, keeps its status and message. Thrown from a page's `load`, it shows that status's error page.
- Any other error is a 500. Its message is sent in development only. In production the browser gets `Internal Server Error` and the server logs the error.

## The request

`getRequest()` from `@inflector/keeno/server` returns the incoming `Request`, for cookies and headers. `setHeader()` adds a header to the response:

```ts
import { getRequest, setHeader } from '@inflector/keeno/server'

const login = server(async (name: string, password: string) => {
  const session = await auth.login(name, password)
  setHeader('set-cookie', `session=${session.id}; HttpOnly; Secure; SameSite=Lax; Path=/`)
})

const me = server(async () => {
  const cookie = getRequest().headers.get('cookie')
  return auth.userFromCookie(cookie)
})
```

`getRequest()` also works while a page renders on the server (`renderStrategy: 'ssr'`).

## Security

- Each call is a `POST` to `/_keeno/fn/<id>` (under the app's `base`). Only the functions written with `server()` can be called.
- Calls need a header that only the app sends, and a request from another site (a different `Origin`) is refused. A form or script on another site can't call them.
- Anyone can call your server functions with any arguments, as with any API endpoint. Check that the user is allowed to do what is asked, and validate the arguments.

## Deploying

When the app has server functions, `vite build` writes the browser files to `dist/client` and a server bundle to `dist/server`, whatever the [render strategy](ssr.md#render-strategies). Serve both with `createHandler()`:

```ts server.ts
import { createServer } from 'node:http'
import { createHandler } from '@inflector/vite-plugin-keeno/server'

createServer(createHandler()).listen(3000)
// or: Bun.serve({ fetch: createHandler().fetch })
```

The handler serves static files and answers server function calls. For pages, it renders them (`ssr`), serves the prerendered HTML (`ssg`, `islands`), or serves `index.html` (`spa`). `vite preview` does the same.
