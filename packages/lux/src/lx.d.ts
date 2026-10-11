// Editor-only types for code inside `.lx` files (used by @inflector/lux-language-server, never at runtime).
// In a .lx file a local state reads as its value, so `state(v)` is typed as the value plus the
// reserved members. `x.foo` on anything else is `x.get().foo`, which is what the intersection gives.
import type { Component, Dep, DerivedOptions, State, StateOptions, UpdateListener } from './index'

export * from './index'

/** A derived declared in a .lx file: reads as `T`, and keeps `get`, `peek` and `onUpdate`. */
export type LxDerived<T> = T & {
  get(): T
  peek(): T
  onUpdate(fn: UpdateListener<T>): () => void
}

/** A state declared in a .lx file: reads as `T`, and keeps its reserved members. */
export type LxState<T> = LxDerived<T> & {
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
export declare function state<T>(value: T, options?: StateOptions<NoInfer<T>>): LxState<NoInfer<T>>
export declare function state<T = undefined>(): LxState<T | undefined>

export declare function derived<T>(fn: () => T, options?: DerivedOptions<NoInfer<T>>): LxDerived<NoInfer<T>>

type MaybeCleanup = void | (() => void) | undefined
export declare function update(fn: () => MaybeCleanup, deps?: readonly (Dep | LxState<any> | unknown)[]): void

type Bindable = { set(value: any): void; peek(): any }

/**
 * What a parent writes for a component whose script calls `props<P>()`. The component receives
 * `children` as a function, but the parent writes it as nested markup (any number of nodes), so
 * it accepts any content there. Optional and required props keep their modifiers.
 */
export type LxComponentProps<P> = { [K in keyof P]: K extends 'children' ? unknown : P[K] }

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

export type LxAttributes<T> = ElementProps<T> &
  EventAttributes<T> & {
    class?: any
    className?: any
    for?: any
    htmlFor?: any
    style?: any
    key?: any
    'bind:value'?: Bindable
    'bind:checked'?: Bindable
    children?: any
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
    type LibraryManagedAttributes<C, P> = 'children' extends keyof P ? LxComponentProps<P> : P
    type IntrinsicElements = {
      [K in keyof HTMLElementTagNameMap]: LxAttributes<HTMLElementTagNameMap[K]>
    } & {
      [K in Exclude<keyof SVGElementTagNameMap, keyof HTMLElementTagNameMap>]: LxAttributes<SVGElementTagNameMap[K]> & {
        [attr: string]: any
      }
    }
  }
}

// `State` comes from `export *` above as a class, so `new State(v)` and `instanceof State` work in .lx files.
export type { Component }
