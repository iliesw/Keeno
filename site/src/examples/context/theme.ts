import { createContext, state, type State } from '@inflector/keeno'

export type Accent = 'orange' | 'violet' | 'teal'

export const ACCENTS: Record<Accent, string> = {
  orange: '#f97316',
  violet: '#8b5cf6',
  teal: '#14b8a6',
}

export const color = (accent: Accent) => ACCENTS[accent]

/** App.kn provides a state, so components that inject it follow changes and can write to it. */
export const AccentContext = createContext<State<Accent>>(state<Accent>('orange'))
