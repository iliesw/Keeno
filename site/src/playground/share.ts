// Playground state in the URL hash: deflate-compressed JSON, base64url-encoded.
import type { PlaygroundFile } from './types'

export interface Snapshot {
  files: PlaygroundFile[]
  tailwind?: boolean
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream)
  return new Uint8Array(await new Response(out).arrayBuffer())
}

function toBase64Url(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

export async function encode(snapshot: Snapshot): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(snapshot))
  return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))
}

export async function decode(hash: string): Promise<Snapshot | null> {
  try {
    const bytes = await pipe(fromBase64Url(hash), new DecompressionStream('deflate-raw'))
    const data = JSON.parse(new TextDecoder().decode(bytes))
    if (!Array.isArray(data?.files) || !data.files.every((f: any) => typeof f?.name === 'string' && typeof f?.code === 'string')) return null
    return data
  } catch {
    return null
  }
}

/** The playground URL for these files (used by "Try it" buttons on code blocks). */
export async function playgroundUrl(snapshot: Snapshot): Promise<string> {
  return `/playground#code=${await encode(snapshot)}`
}
