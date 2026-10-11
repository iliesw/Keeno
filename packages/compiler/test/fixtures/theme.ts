import { createContext, state, type State } from '@inflector/keeno'

export const Theme = createContext<State<string>>(state('light'), 'theme')
export const User = createContext<{ name: string; color: string }>({ name: '', color: '' }, 'user')
