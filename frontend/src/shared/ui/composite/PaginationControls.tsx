import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { getPageWindow, nextOffset, previousOffset } from "@/shared/lib/pagination"
import { cn } from "@/shared/lib/utils"
import { PAGINATION } from "@/shared/schemas/primitives"
import { Button } from "@/shared/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

/**
 * Offset pagination, expressed in the terms people think in — "41–60 of 237",
 * "page 3 of 12" (docs/frontend/API_INTEGRATION_PLAN.md §6).
 *
 * Windowed rather than infinite scroll: a professional tool should be honest
 * about position and total, and offset paging is what the backend provides.
 * All arithmetic comes from `shared/lib/pagination.ts`, so no screen hand-rolls
 * an off-by-one.
 */

const PAGE_SIZES = [10, 20, 50, 100] as const

interface PaginationControlsProps {
  total: number
  limit: number
  offset: number
  itemCount: number
  onOffsetChange: (offset: number) => void
  onLimitChange: (limit: number) => void
  /** Disables navigation while the next page is in flight. */
  disabled?: boolean
  className?: string
}

export function PaginationControls({
  total,
  limit,
  offset,
  itemCount,
  onOffsetChange,
  onLimitChange,
  disabled = false,
  className,
}: PaginationControlsProps) {
  const window = getPageWindow({ total, limit, offset, itemCount })

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex shrink-0 flex-wrap items-center justify-between gap-3 border-t px-5 py-2",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {itemCount === 0 ? (
          "No results"
        ) : (
          <>
            <span className="text-foreground">
              {window.from}–{window.to}
            </span>{" "}
            of {total}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label htmlFor="page-size" className="text-xs text-muted-foreground">
            Per page
          </label>
          <Select
            value={String(limit)}
            onValueChange={(value) => onLimitChange(Number(value))}
            disabled={disabled}
          >
            <SelectTrigger id="page-size" size="sm" className="w-[4.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZES.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-muted-foreground">
            Page {window.page} of {window.pageCount}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            disabled={disabled || !window.hasPrevious}
            onClick={() => onOffsetChange(previousOffset(offset, limit))}
          >
            <ChevronLeftIcon aria-hidden />
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            disabled={disabled || !window.hasNext}
            onClick={() => onOffsetChange(nextOffset(offset, limit, total))}
          >
            <ChevronRightIcon aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  )
}

export { PAGE_SIZES, PAGINATION }
