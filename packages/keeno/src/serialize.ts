// Values sent between the browser and server functions: JSON, plus the types JSON loses.
//
// `encode` turns a value into JSON-safe data and `decode` turns it back. Dates, Maps, Sets,
// BigInts, undefined, NaN, ±Infinity, -0, RegExps and URLs survive; class instances arrive as
// plain objects, and functions and symbols can't be sent. An object is tagged as `{ $k: kind, v }`;
// a plain object that happens to have a `$k` key is wrapped the same way, so nothing is ambiguous.

type Tagged = { $k: string; v?: unknown }

export function encode(value: unknown, seen: Set<object> = new Set()): unknown {
  switch (typeof value) {
    case 'undefined':
      return { $k: 'u' }
    case 'bigint':
      return { $k: 'n', v: value.toString() }
    case 'number':
      if (Number.isNaN(value)) return { $k: 'NaN' }
      if (value === Infinity) return { $k: 'Inf' }
      if (value === -Infinity) return { $k: '-Inf' }
      if (Object.is(value, -0)) return { $k: '-0' }
      return value
    case 'function':
    case 'symbol':
      throw new TypeError(`[keeno] a ${typeof value} can't be sent to or from a server function`)
    case 'object':
      break
    default:
      return value
  }
  if (value === null) return null
  if (seen.has(value)) throw new TypeError("[keeno] a value with a cycle can't be sent to or from a server function")
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((v) => encode(v, seen))
    if (value instanceof Date) return { $k: 'Date', v: value.getTime() }
    if (value instanceof Map) return { $k: 'Map', v: [...value].map(([k, v]) => [encode(k, seen), encode(v, seen)]) }
    if (value instanceof Set) return { $k: 'Set', v: [...value].map((v) => encode(v, seen)) }
    if (value instanceof RegExp) return { $k: 'RegExp', v: [value.source, value.flags] }
    if (typeof URL !== 'undefined' && value instanceof URL) return { $k: 'URL', v: value.href }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(value)) out[key] = encode((value as Record<string, unknown>)[key], seen)
    return '$k' in out ? { $k: 'O', v: out } : out
  } finally {
    seen.delete(value)
  }
}

export function decode(data: unknown): unknown {
  if (data === null || typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(decode)
  const tagged = data as Tagged
  if (typeof tagged.$k === 'string') {
    const v = tagged.v
    switch (tagged.$k) {
      case 'u':
        return undefined
      case 'n':
        return BigInt(v as string)
      case 'NaN':
        return NaN
      case 'Inf':
        return Infinity
      case '-Inf':
        return -Infinity
      case '-0':
        return -0
      case 'Date':
        return new Date(v as number)
      case 'Map':
        return new Map((v as [unknown, unknown][]).map(([k, x]) => [decode(k), decode(x)]))
      case 'Set':
        return new Set((v as unknown[]).map(decode))
      case 'RegExp':
        return new RegExp(...(v as [string, string]))
      case 'URL':
        return new URL(v as string)
      case 'O':
        return decodeObject(v as Record<string, unknown>)
    }
  }
  return decodeObject(data as Record<string, unknown>)
}

function decodeObject(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  // `__proto__` from JSON is an own key: define it, don't assign it (which would set the prototype).
  for (const key of Object.keys(data)) Object.defineProperty(out, key, { value: decode(data[key]), enumerable: true, writable: true, configurable: true })
  return out
}
