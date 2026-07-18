import { type ColumnDef, flexRender, getCoreRowModel, useReactTable } from "@tanstack/react-table"
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from "lucide-react"
import type { ReactNode } from "react"

import { cn } from "@/shared/lib/utils"
import type { SortOrder } from "@/shared/schemas/primitives"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/table"

/**
 * The one table engine in the app (docs/frontend/COMPONENT_HIERARCHY.md §4).
 *
 * TanStack Table supplies the headless row/column model; the shadcn `Table`
 * primitives supply the markup and accessibility. Sorting is **server-driven** —
 * the backend owns ordering and pagination, so the table reports sort *intent*
 * upward rather than reordering rows itself. Sorting client-side would only
 * reorder the current page, which is worse than not sorting at all.
 *
 * Entity-agnostic: it knows about rows and columns, never about characters.
 */

export interface DataTableProps<TRow> {
  columns: ColumnDef<TRow>[]
  rows: TRow[]
  getRowId: (row: TRow) => string
  /** Which column is currently ordering the data, server-side. */
  sortBy?: string
  sortOrder?: SortOrder
  /** Column ids the backend will actually honour. */
  sortableColumnIds?: readonly string[]
  onSortChange?: (columnId: string) => void
  onRowClick?: (row: TRow) => void
  /** Row currently shown in a detail/inspector surface. */
  selectedRowId?: string
  /** Shown in place of rows when there are none. */
  emptyState?: ReactNode
  /** Dims the table during a background refetch without unmounting it. */
  isFetching?: boolean
  className?: string
}

export function DataTable<TRow>({
  columns,
  rows,
  getRowId,
  sortBy,
  sortOrder = "asc",
  sortableColumnIds = [],
  onSortChange,
  onRowClick,
  selectedRowId,
  emptyState,
  isFetching = false,
  className,
}: DataTableProps<TRow>) {
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getRowId,
    // Sorting and pagination are the server's job; the table is a renderer.
    manualSorting: true,
    manualPagination: true,
  })

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div
      className={cn(
        "relative w-full transition-opacity",
        // Stale-while-revalidate made visible: previous rows stay readable and
        // interactive while the next page loads.
        isFetching && "opacity-60",
        className,
      )}
    >
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const isSortable = sortableColumnIds.includes(header.column.id) && onSortChange
                const isSorted = sortBy === header.column.id
                const label = flexRender(header.column.columnDef.header, header.getContext())

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={
                      isSorted ? (sortOrder === "asc" ? "ascending" : "descending") : undefined
                    }
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange(header.column.id)}
                        // `uppercase` is repeated from the `TableHead` because
                        // browsers do not inherit `text-transform` into form
                        // controls — without it, sortable headers would render
                        // in a different case from static ones.
                        className="-mx-1 flex items-center gap-1 rounded-sm px-1 uppercase focus-ring transition-chrome hover:text-foreground"
                      >
                        {label}
                        <SortIcon active={isSorted} order={sortOrder} />
                      </button>
                    ) : (
                      label
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              data-state={selectedRowId === row.id ? "selected" : undefined}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              // Rows are navigational when clickable, so they must also be
              // reachable and activatable from the keyboard.
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "link" : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onRowClick(row.original)
                      }
                    }
                  : undefined
              }
              className={cn(onRowClick && "cursor-pointer focus-ring")}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SortIcon({ active, order }: { active: boolean; order: SortOrder }) {
  if (!active) {
    return <ChevronsUpDownIcon className="size-3 opacity-40" aria-hidden />
  }
  return order === "asc" ? (
    <ArrowUpIcon className="size-3" aria-hidden />
  ) : (
    <ArrowDownIcon className="size-3" aria-hidden />
  )
}
