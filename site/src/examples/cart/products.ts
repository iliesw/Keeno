export interface Product {
  id: string
  name: string
  price: number
  emoji: string
}

export const PRODUCTS: Product[] = [
  { id: 'mug', name: 'Signal mug', price: 14, emoji: '☕' },
  { id: 'tee', name: 'Compiler tee', price: 28, emoji: '👕' },
  { id: 'stickers', name: 'Sticker pack', price: 6, emoji: '✨' },
  { id: 'cap', name: 'Derived cap', price: 22, emoji: '🧢' },
]

/** Promo codes and the share of the subtotal they take off. */
export const CODES: Record<string, number> = { KEENO: 0.2, SIGNALS: 0.1 }
