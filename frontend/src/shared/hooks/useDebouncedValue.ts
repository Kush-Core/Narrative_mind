import { useEffect, useState } from "react"

/**
 * Trail a rapidly-changing value by a delay.
 *
 * Used for search-as-you-type: the input stays fully responsive while the
 * request (and the URL it is derived from) only follows once typing pauses.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
