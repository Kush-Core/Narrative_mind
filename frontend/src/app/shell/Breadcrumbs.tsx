import { ChevronRightIcon } from "lucide-react"
import { Link, useLocation } from "react-router-dom"

import { findNavItemByPath, navSections } from "@/app/shell/navigation"
import { paths } from "@/routes/paths"

/**
 * The "where am I" trail in the command bar.
 *
 * Derived entirely from the navigation model and the current URL — no screen
 * pushes crumbs into a store, so the trail cannot go stale or disagree with the
 * address bar.
 */
export function Breadcrumbs() {
  const { pathname } = useLocation()
  const active = findNavItemByPath(pathname)

  if (!active || active.path === paths.root()) {
    return <span className="truncate text-sm text-muted-foreground">Overview</span>
  }

  const section = navSections.find((candidate) => candidate.items.includes(active))

  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="shrink-0">
          <Link
            to={paths.root()}
            className="rounded-sm text-muted-foreground focus-ring transition-chrome outline-none hover:text-foreground"
          >
            World
          </Link>
        </li>
        {section ? (
          <>
            <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            <li className="shrink-0 text-muted-foreground">{section.label}</li>
          </>
        ) : null}
        <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
        <li className="truncate font-medium text-foreground" aria-current="page">
          {active.label}
        </li>
      </ol>
    </nav>
  )
}
