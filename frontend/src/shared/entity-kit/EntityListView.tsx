import type { ColumnDef } from "@tanstack/react-table"
import { FilterXIcon, PlusIcon } from "lucide-react"
import { useMemo } from "react"
import type { FieldValues } from "react-hook-form"
import { useNavigate } from "react-router-dom"

import { toUserMessage } from "@/shared/api/error-presentation"
import type { BaseListParams, EntityDescriptor } from "@/shared/entity-kit/types"
import { useEntityListQuery } from "@/shared/entity-kit/useEntityQueries"
import { useUrlListState } from "@/shared/hooks/useUrlListState"
import type { Identifiable } from "@/shared/types/utility"
import { Button } from "@/shared/ui/button"
import { DataTable } from "@/shared/ui/composite/DataTable"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { ErrorState } from "@/shared/ui/composite/ErrorState"
import { LoadingState } from "@/shared/ui/composite/LoadingState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"
import { PaginationControls } from "@/shared/ui/composite/PaginationControls"
import { SearchInput } from "@/shared/ui/composite/SearchInput"
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "@/shared/ui/composite/Toolbar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

/**
 * The generic list screen (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * Reads its state from the URL, runs the list query, and renders the toolbar,
 * table, and pagination from the descriptor. Every entity gets identical
 * behaviour — search debouncing, sort toggling, page-reset-on-filter, keyboard
 * row activation — from this one implementation.
 *
 * The three non-happy paths are handled distinctly and deliberately:
 *   - *pending*  → skeleton shaped like the table (no layout jump)
 *   - *error*    → in-place `ErrorState` with retry (a read failed; nothing to show)
 *   - *empty*    → `EmptyState`, and it distinguishes "nothing exists yet" from
 *                  "nothing matches your filters", which need different actions.
 */

const ALL_FILTER_VALUE = "__all__"

interface EntityListViewProps<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
> {
  descriptor: EntityDescriptor<TRead, TForm, TListParams>
  onCreate: () => void
}

export function EntityListView<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
>({ descriptor, onCreate }: EntityListViewProps<TRead, TForm, TListParams>) {
  const navigate = useNavigate()

  // The descriptor is the only thing that knows this entity's filter param, so
  // it is the descriptor that tells the URL hook — rather than the hook holding
  // a list of every entity's filter names.
  const filter = descriptor.filter
  const filterKeys = useMemo(() => (filter ? [filter.name] : []), [filter])

  const { params, setParams, reset, isFiltered } = useUrlListState(descriptor.listParamsSchema, {
    filterKeys,
  })
  const query = useEntityListQuery(descriptor, params)

  const columns = useMemo<ColumnDef<TRead>[]>(
    () =>
      descriptor.columns.map((spec) => ({
        id: spec.id,
        header: spec.header,
        cell: ({ row }) => spec.cell(row.original),
      })),
    [descriptor.columns],
  )

  const page = query.data
  const filterValue = filter
    ? ((params as Record<string, unknown>)[filter.name] as string | undefined)
    : undefined

  function handleFilterChange(value: string | undefined) {
    if (!filter) return
    setParams({ [filter.name]: value === "" ? undefined : value })
  }

  /** Clicking the active sort column flips direction; a new column starts ascending. */
  function handleSortChange(columnId: string) {
    const isActive = params.sortBy === columnId
    setParams({
      sortBy: columnId,
      order: isActive && params.order === "asc" ? "desc" : "asc",
    })
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={descriptor.plural}
        accentClassName={descriptor.accentClassName}
        actions={
          <Button size="sm" onClick={onCreate}>
            <PlusIcon aria-hidden />
            New {descriptor.singular.toLowerCase()}
          </Button>
        }
      >
        <Toolbar>
          <ToolbarGroup>
            <SearchInput
              value={(params as { nameContains?: string }).nameContains ?? ""}
              onValueChange={(value) => setParams({ nameContains: value })}
              placeholder={`Search ${descriptor.plural.toLowerCase()} by name…`}
              label={`Search ${descriptor.plural.toLowerCase()}`}
              className="w-64"
            />

            {/* Closed value sets get a select; open-ended ones get a debounced
                input. The engine switches on the descriptor's declared `kind`,
                never on which entity it is rendering. */}
            {filter?.kind === "select" ? (
              <Select
                value={filterValue ?? ALL_FILTER_VALUE}
                onValueChange={(value) =>
                  handleFilterChange(value === ALL_FILTER_VALUE ? undefined : value)
                }
              >
                <SelectTrigger size="sm" className="w-36" aria-label={filter.label}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_FILTER_VALUE}>{filter.allLabel}</SelectItem>
                  {filter.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : filter?.kind === "text" ? (
              <SearchInput
                value={filterValue ?? ""}
                onValueChange={handleFilterChange}
                placeholder={filter.placeholder ?? filter.label}
                label={filter.label}
                className="w-48"
              />
            ) : null}

            {descriptor.slots?.listToolbar?.()}
          </ToolbarGroup>

          <ToolbarSpacer />

          {isFiltered ? (
            <Button variant="ghost" size="sm" onClick={reset}>
              <FilterXIcon aria-hidden />
              Clear filters
            </Button>
          ) : null}
        </Toolbar>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {query.isPending ? (
          <LoadingState rows={8} label={`Loading ${descriptor.plural.toLowerCase()}`} />
        ) : query.isError ? (
          <ErrorState
            title={`Could not load ${descriptor.plural.toLowerCase()}`}
            description={toUserMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <DataTable
            columns={columns}
            rows={page?.items ?? []}
            getRowId={(row) => row.id}
            sortBy={params.sortBy}
            sortOrder={params.order}
            sortableColumnIds={descriptor.sortableFields}
            onSortChange={handleSortChange}
            onRowClick={(row) => void navigate(descriptor.routes.detail(row.id))}
            isFetching={query.isFetching}
            emptyState={
              isFiltered ? (
                <EmptyState
                  title="No matches"
                  description="No results for the current search and filters."
                  action={
                    <Button variant="outline" size="sm" onClick={reset}>
                      Clear filters
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  icon={descriptor.icon}
                  title={descriptor.emptyState.title}
                  description={descriptor.emptyState.description}
                  action={
                    <Button size="sm" onClick={onCreate}>
                      <PlusIcon aria-hidden />
                      New {descriptor.singular.toLowerCase()}
                    </Button>
                  }
                />
              )
            }
          />
        )}
      </div>

      {page && page.total > 0 ? (
        <PaginationControls
          total={page.total}
          limit={page.limit}
          offset={page.offset}
          itemCount={page.items.length}
          onOffsetChange={(offset) => setParams({ offset })}
          onLimitChange={(limit) => setParams({ limit, offset: 0 })}
          disabled={query.isFetching}
        />
      ) : null}
    </div>
  )
}
