export interface User {
  id: number
  name: string
  role: string
  city: string
  color: string
}

const users: User[] = [
  { id: 1, name: 'Ada Lovelace', role: 'Mathematician', city: 'London', color: '#f97316' },
  { id: 2, name: 'Grace Hopper', role: 'Computer scientist', city: 'New York', color: '#3b82f6' },
  { id: 3, name: 'Alan Turing', role: 'Mathematician', city: 'Manchester', color: '#22c55e' },
  { id: 4, name: 'Katherine Johnson', role: 'Mathematician', city: 'Hampton', color: '#a855f7' },
  { id: 5, name: 'Margaret Hamilton', role: 'Software engineer', city: 'Boston', color: '#ec4899' },
]

/** A fake API call: resolves after a short delay, or fails on request. */
export function fetchUser(id: number, fail = false): Promise<User> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (fail) reject(new Error('503 Service Unavailable'))
      else resolve(users.find((u) => u.id === id)!)
    }, 700)
  })
}
