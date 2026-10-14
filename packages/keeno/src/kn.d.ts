// Editor-only types for code inside `.kn` files (used by @inflector/keeno-language-server, never at runtime).
// In a .kn file a local state reads as its value, so `state(v)` is typed as the value plus the
// reserved members. `x.foo` on anything else is `x.get().foo`, which is what the intersection gives.
import type { AsyncContext, Component, Context, Dep, DerivedOptions, RefTarget, Signal, State, StateOptions, UpdateListener } from './index'

export * from './index'

/** A derived declared in a .kn file: reads as `T`, and keeps `get`, `peek` and `onUpdate`. */
export type KnDerived<T> = T & {
  get(): T
  peek(): T
  onUpdate(fn: UpdateListener<T>): () => void
}

/** A state declared in a .kn file: reads as `T`, and keeps its reserved members. */
export type KnState<T> = KnDerived<T> & {
  set(value: T): void
  /** Go back to the previous value (needs the `history` option). */
  undo(): void
  /** Re-apply a value removed by `undo()` (needs the `history` option). */
  redo(): void
  readonly canUndo: boolean
  readonly canRedo: boolean
}

// `NoInfer` keeps TypeScript from inferring literal types: `state(0)` is a number state, not `0`.
// Limitation: `null`/`undefined` disappear from the read type (`null & {…}` is `never`).
export declare function state<T>(value: T, options?: StateOptions<NoInfer<T>>): KnState<NoInfer<T>>
export declare function state<T = undefined>(): KnState<T | undefined>

/** An async derived declared in a .kn file: reads as the resolved value (inside `<Loading>`). */
export type KnAsyncDerived<T> = KnDerived<T> & {
  /** Run the function again, keeping the current value until the new one arrives. */
  refresh(): void
}

export declare function derived<T>(fn: (ctx: AsyncContext) => Promise<T>, options?: DerivedOptions<NoInfer<T>>): KnAsyncDerived<NoInfer<T>>
export declare function derived<T>(fn: () => T, options?: DerivedOptions<NoInfer<T>>): KnDerived<NoInfer<T>>

type SignalValue<T> = T extends Signal<infer V> ? V : T

/** In a .kn file, a state or derived is provided as itself, and other values stay reactive. */
export declare function provide<T>(context: Context<T>, value: T | SignalValue<T> | KnDerived<SignalValue<T>>): void

/** In a .kn file, an injected value reads like a state: writable if a state was provided, else read-only. */
export declare function inject<T>(
  context: Context<T>,
): [T] extends [State<infer V>] ? KnState<V> : [T] extends [Signal<infer V>] ? KnDerived<V> : KnDerived<T>

type MaybeCleanup = void | (() => void) | undefined
export declare function update(fn: () => MaybeCleanup, deps?: readonly (Dep | KnState<any> | unknown)[]): void

// A state, or a property of a store (typed as its value: `bind:value={form.name}`).
/** What `use:name={value}` checks as: a directive accepting this element type. */
declare const knUse: unique symbol
export type KnUse<E> = { readonly [knUse]: (el: E) => void }

/**
 * Editor-only: the language server rewrites `use:tooltip={v}` to `use:tooltip={__kn_use(tooltip, v)}`,
 * which checks the value against the directive and, through `KnUse`, the element type.
 */
export declare function __kn_use<E extends Element, V>(directive: (el: E, value: V) => unknown, value: NoInfer<V>): KnUse<E>
export declare function __kn_use<E extends Element>(directive: (el: E, value?: undefined) => unknown): KnUse<E>

type Bindable = { set(value: any): void; peek(): any } | string | number | boolean | null | undefined

/**
 * What a parent writes for a component whose script calls `props<P>()`. The component receives
 * `children` as a function, but the parent writes it as nested markup (any number of nodes), so
 * it accepts any content there. Optional and required props keep their modifiers.
 */
export type KnComponentProps<P> = { [K in keyof P]: K extends 'children' ? unknown : P[K] }

// ---------------------------------------------------------------------------
// JSX: intrinsic elements and their attributes

type IfEquals<X, Y, A, B = never> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B
type WritableKeys<T> = {
  [P in keyof T]-?: IfEquals<{ [Q in P]: T[P] }, { -readonly [Q in P]: T[P] }, P>
}[keyof T]
/** DOM properties that are not useful as attributes in a template. */
type NotAttributes = 'classList' | 'nodeValue' | 'outerHTML' | 'outerText' | 'innerText' | 'part' | 'scrollLeft' | 'scrollTop'
type ElementProps<E> = {
  [K in WritableKeys<E> as K extends `on${string}` | `aria${Capitalize<string>}` | NotAttributes
    ? never
    : E[K] extends (...args: any[]) => any
      ? never
      : K]?: any
}

type Handler<E extends Event, T> = (event: E & { currentTarget: T }) => void

interface EventAttributes<T> {
  onAbort?: Handler<UIEvent, T>
  onAnimationEnd?: Handler<AnimationEvent, T>
  onAnimationStart?: Handler<AnimationEvent, T>
  onBeforeInput?: Handler<InputEvent, T>
  onBlur?: Handler<FocusEvent, T>
  onChange?: Handler<Event, T>
  onClick?: Handler<MouseEvent, T>
  onContextMenu?: Handler<MouseEvent, T>
  onCopy?: Handler<ClipboardEvent, T>
  onCut?: Handler<ClipboardEvent, T>
  onDblClick?: Handler<MouseEvent, T>
  onDrag?: Handler<DragEvent, T>
  onDragEnd?: Handler<DragEvent, T>
  onDragEnter?: Handler<DragEvent, T>
  onDragLeave?: Handler<DragEvent, T>
  onDragOver?: Handler<DragEvent, T>
  onDragStart?: Handler<DragEvent, T>
  onDrop?: Handler<DragEvent, T>
  onError?: Handler<Event, T>
  onFocus?: Handler<FocusEvent, T>
  onFocusIn?: Handler<FocusEvent, T>
  onFocusOut?: Handler<FocusEvent, T>
  onInput?: Handler<InputEvent, T>
  onInvalid?: Handler<Event, T>
  onKeyDown?: Handler<KeyboardEvent, T>
  onKeyUp?: Handler<KeyboardEvent, T>
  onLoad?: Handler<Event, T>
  onMouseDown?: Handler<MouseEvent, T>
  onMouseEnter?: Handler<MouseEvent, T>
  onMouseLeave?: Handler<MouseEvent, T>
  onMouseMove?: Handler<MouseEvent, T>
  onMouseOut?: Handler<MouseEvent, T>
  onMouseOver?: Handler<MouseEvent, T>
  onMouseUp?: Handler<MouseEvent, T>
  onPaste?: Handler<ClipboardEvent, T>
  onPointerCancel?: Handler<PointerEvent, T>
  onPointerDown?: Handler<PointerEvent, T>
  onPointerEnter?: Handler<PointerEvent, T>
  onPointerLeave?: Handler<PointerEvent, T>
  onPointerMove?: Handler<PointerEvent, T>
  onPointerUp?: Handler<PointerEvent, T>
  onReset?: Handler<Event, T>
  onScroll?: Handler<Event, T>
  onSelect?: Handler<Event, T>
  onSubmit?: Handler<SubmitEvent, T>
  onToggle?: Handler<Event, T>
  onTouchCancel?: Handler<TouchEvent, T>
  onTouchEnd?: Handler<TouchEvent, T>
  onTouchMove?: Handler<TouchEvent, T>
  onTouchStart?: Handler<TouchEvent, T>
  onTransitionEnd?: Handler<TransitionEvent, T>
  onWheel?: Handler<WheelEvent, T>
  /** Any other event: `onFooBar` listens to `foobar`. */
  [event: `on${Capitalize<string>}`]: ((event: any) => void) | undefined
}

export type KnAttributes<T> = ElementProps<T> &
  EventAttributes<T> & {
    class?: any
    className?: any
    for?: any
    htmlFor?: any
    style?: any
    key?: any
    ref?: RefTarget<T extends Element ? T : Element>
    'bind:value'?: Bindable
    'bind:checked'?: Bindable
    children?: any
  } & {
    /** `use:name={value}`: the language server checks it as `__kn_use(name, value)`. */
    [directive: `use:${string}`]: KnUse<T>
  }

declare global {
  namespace JSX {
    type Element = any
    interface ElementChildrenAttribute {
      children: {}
    }
    interface IntrinsicAttributes {
      key?: any
    }
    /** Parents write nested markup where components receive `children` as a render function. */
    type LibraryManagedAttributes<C, P> = 'children' extends keyof P ? KnComponentProps<P> : P
    type IntrinsicElements = {
      [K in keyof HTMLElementTagNameMap]: KnAttributes<HTMLElementTagNameMap[K]>
    } & {
      /** `property`: Open Graph and other RDFa metadata (`<meta property="og:title" content="…">`). */
      meta: { property?: any }
    } & {
      [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: KnAttributes<SVGElementTagNameMap[K]> & {
        [attr: string]: any
      }
    }
  }
}

// `State` comes from `export *` above as a class, so `new State(v)` and `instanceof State` work in .kn files.
export type { Component }
