export interface Figure {
  name: string
  means: string
  range: [number, number, number]
  tour: ([number, number] | null)[] | null
  mount(host: { stage: HTMLElement; svg: SVGSVGElement; read: { textContent: string | null } }, value: number): { set(value: number): void; destroy(): void }
}
/** The Parcel figure, built on the kernel it is given. */
export function parcel(HL: any): Figure
