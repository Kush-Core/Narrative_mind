import { ConstructionIcon } from "lucide-react"
import { useLocation } from "react-router-dom"

import { findNavItemByPath } from "@/app/shell/navigation"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"

/**
 * The surface behind every destination whose feature slice has not been built.
 *
 * It exists so the *navigation architecture* is real and walkable now — every
 * sidebar entry, breadcrumb, and shortcut leads somewhere and comes back — while
 * the app still contains no domain functionality. Each slice replaces its own
 * route element as it lands (M3+); this file is deleted when the last one does.
 *
 * It reads the navigation model rather than taking props, so a new destination
 * needs no route-specific placeholder written for it.
 */
export function RoutePlaceholder() {
  const { pathname } = useLocation()
  const item = findNavItemByPath(pathname)
  const title = item?.label ?? "Workspace"

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={title}
        description="This part of the workspace is not built yet."
        accentClassName={item?.accentClassName}
      />
      <EmptyState
        icon={ConstructionIcon}
        title={`${title} is coming`}
        description="The workspace shell, design system, and navigation are in place. This surface arrives with its feature slice."
      />
    </div>
  )
}
