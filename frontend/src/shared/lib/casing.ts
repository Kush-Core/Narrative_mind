/**
 * The casing anti-corruption boundary (docs/frontend/API_INTEGRATION_PLAN.md §3).
 *
 * The wire is snake_case (`created_at`, `timeline_order`, `name_contains`); the
 * app is camelCase. These helpers are the *mechanism*; each entity's schema file
 * decides where to apply them.
 *
 * A deliberate note on scope: these convert **keys only, one level deep by
 * default**, with an explicit recursive variant. Blanket deep conversion is a
 * classic source of silent corruption — it rewrites keys inside free-form data
 * the backend expects verbatim. Entity mappers should prefer explicit field
 * mapping; these exist for the mechanical majority of fields where the only
 * difference is casing.
 */

import type { UnknownRecord } from "@/shared/types/utility"

/** `created_at` → `createdAt`. Leading underscores are preserved. */
export function snakeToCamel(key: string): string {
  return key.replace(/([^_])_([a-z0-9])/g, (_match, prefix: string, char: string) => {
    return `${prefix}${char.toUpperCase()}`
  })
}

/** `createdAt` → `created_at`. */
export function camelToSnake(key: string): string {
  return key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
}

function mapKeys(input: UnknownRecord, transform: (key: string) => string): UnknownRecord {
  const output: UnknownRecord = {}
  for (const [key, value] of Object.entries(input)) {
    output[transform(key)] = value
  }
  return output
}

/** Convert an object's own keys from snake_case to camelCase (one level). */
export function keysToCamel(input: UnknownRecord): UnknownRecord {
  return mapKeys(input, snakeToCamel)
}

/** Convert an object's own keys from camelCase to snake_case (one level). */
export function keysToSnake(input: UnknownRecord): UnknownRecord {
  return mapKeys(input, camelToSnake)
}

/**
 * Recursive key conversion, for nested response payloads.
 *
 * Arrays are mapped element-wise; non-plain objects (`Date`, `File`, class
 * instances) are passed through untouched rather than being flattened into
 * plain objects.
 */
export function deepKeysToCamel<T>(input: T): T {
  return deepMapKeys(input, snakeToCamel) as T
}

export function deepKeysToSnake<T>(input: T): T {
  return deepMapKeys(input, camelToSnake) as T
}

function isPlainObject(value: unknown): value is UnknownRecord {
  if (typeof value !== "object" || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function deepMapKeys(value: unknown, transform: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => deepMapKeys(item, transform))
  if (!isPlainObject(value)) return value

  const output: UnknownRecord = {}
  for (const [key, nested] of Object.entries(value)) {
    output[transform(key)] = deepMapKeys(nested, transform)
  }
  return output
}

/**
 * Drop keys whose value is `undefined`.
 *
 * Used when building request bodies: an explicit `undefined` would serialize
 * away anyway, but removing it first makes the "did anything actually change?"
 * check in `diffForUpdate` honest.
 */
export function omitUndefined<T extends UnknownRecord>(input: T): Partial<T> {
  const output: UnknownRecord = {}
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) output[key] = value
  }
  return output as Partial<T>
}
