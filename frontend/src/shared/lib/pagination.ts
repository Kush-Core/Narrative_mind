/**
 * Offset-pagination helpers (docs/frontend/API_INTEGRATION_PLAN.md §6).
 *
 * The backend is offset-based (`limit`/`offset`/`total`), but people think in
 * pages ("3 of 12") and ranges ("41–60 of 237"). These pure functions do that
 * translation once, so every paginated surface counts the same way and no view
 * hand-rolls an off-by-one.
 */

import { PAGINATION } from "@/shared/schemas/primitives"

export interface PageWindow {
  /** 1-based page number containing `offset`. */
  page: number
  /** Total number of pages; at least 1, even when empty. */
  pageCount: number
  /** 1-based index of the first item on this page; 0 when the page is empty. */
  from: number
  /** 1-based index of the last item on this page; 0 when the page is empty. */
  to: number
  hasPrevious: boolean
  hasNext: boolean
}

interface PageWindowInput {
  total: number
  limit: number
  offset: number
  /** Items actually returned; may be fewer than `limit` on the last page. */
  itemCount: number
}

/** Describe the current position within a paginated collection. */
export function getPageWindow({ total, limit, offset, itemCount }: PageWindowInput): PageWindow {
  const safeLimit = Math.max(limit, PAGINATION.minLimit)
  const pageCount = Math.max(1, Math.ceil(total / safeLimit))
  const page = Math.floor(offset / safeLimit) + 1

  return {
    page,
    pageCount,
    from: itemCount === 0 ? 0 : offset + 1,
    to: itemCount === 0 ? 0 : offset + itemCount,
    hasPrevious: offset > 0,
    hasNext: offset + itemCount < total,
  }
}

/** Offset of the next page. Clamped so it can never run past the collection. */
export function nextOffset(offset: number, limit: number, total: number): number {
  const candidate = offset + limit
  return candidate >= total ? offset : candidate
}

/** Offset of the previous page, never below zero. */
export function previousOffset(offset: number, limit: number): number {
  return Math.max(PAGINATION.minOffset, offset - limit)
}

/** Offset of a given 1-based page number. */
export function offsetForPage(page: number, limit: number): number {
  return Math.max(PAGINATION.minOffset, (Math.max(1, page) - 1) * limit)
}

/**
 * Offset to land on after deleting items from the current page.
 *
 * Deleting the only item on the last page would otherwise leave the user
 * stranded on an empty page; this steps back to the previous one.
 */
export function offsetAfterRemoval(offset: number, limit: number, remainingOnPage: number): number {
  if (remainingOnPage > 0 || offset === 0) return offset
  return previousOffset(offset, limit)
}
