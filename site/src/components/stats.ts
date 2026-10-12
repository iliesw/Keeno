// The cards of the home page's numbers strip (StatsStrip.kn).
export type StatArt = 'size' | 'direct' | 'once' | 'grid'

export interface Stat {
  value: number
  decimals?: number
  suffix?: string
  label: string
  /** Small heading above the card. */
  kicker: string
  /** One sentence on why it matters. */
  text: string
  href: string
  art: StatArt
  /** Spans two columns, with the illustration beside the text. */
  wide?: boolean
}
