// A fake server: the "database" survives the component, so a fresh copy shows what was saved.
export interface Post {
  id: number
  title: string
  likes: number
  liked: boolean
}

export const db: Post[] = [
  { id: 1, title: 'Signals without a virtual DOM', likes: 41, liked: false },
  { id: 2, title: 'Islands: ship less JavaScript', likes: 128, liked: true },
  { id: 3, title: 'Optimistic UI in one option', likes: 7, liked: false },
]

/** Saves after a delay, and fails when `fail` is on, like a flaky network. */
export function savePosts(posts: Post[], fail: boolean, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (fail) return reject(new Error('Network error: the like was not saved'))
      db.splice(0, db.length, ...posts.map((p) => ({ ...p })))
      resolve()
    }, 900)
    signal.addEventListener('abort', () => clearTimeout(timer))
  })
}
