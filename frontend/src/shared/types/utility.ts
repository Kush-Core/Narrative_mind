/**
 * Generic TypeScript utility types used across the infrastructure.
 *
 * Deliberately small: only types that earn their keep by being needed in more
 * than one place. This is *not* a grab-bag of type tricks — an unused utility
 * type is as much dead weight as unused code.
 */

/** A JSON value, for the few places a truly unknown payload is described. */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/** A plain object with unknown values — safer than `Record<string, any>`. */
export type UnknownRecord = Record<string, unknown>

/**
 * Make the listed keys optional, leaving the rest untouched.
 * Useful for "everything the server sends, minus what the client supplies".
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

/** Make the listed keys required, leaving the rest untouched. */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>

/**
 * Strip `readonly` and flatten intersections so hover tooltips show the real
 * shape rather than `A & B & C`.
 */
export type Prettify<T> = { -readonly [K in keyof T]: T[K] } & {}

/** A value that may arrive synchronously or as a promise. */
export type Awaitable<T> = T | Promise<T>

/**
 * Anything with an `id` — the minimum contract every backend entity satisfies.
 *
 * A type alias rather than an interface, deliberately: aliases carry an implicit
 * index signature, so generic code constrained to `Identifiable` can still read
 * fields by name without an assertion.
 */
export type Identifiable = {
  id: string
}
