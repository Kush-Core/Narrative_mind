import { appConfig } from "@/shared/config/env"

/**
 * Top workspace bar. Foundation stage: brand only. M1 adds breadcrumbs, the
 * global-search trigger, and command-palette affordances
 * (docs/frontend/COMPONENT_HIERARCHY.md §7).
 */
export function CommandBar() {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b px-4">
      <span className="text-sm font-semibold tracking-tight">{appConfig.appName}</span>
    </header>
  )
}
