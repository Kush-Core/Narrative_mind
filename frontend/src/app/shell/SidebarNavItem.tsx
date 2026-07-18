import { NavLink } from "react-router-dom"

import type { NavItem } from "@/app/shell/navigation"
import { cn } from "@/shared/lib/utils"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

interface SidebarNavItemProps {
  item: NavItem
  collapsed: boolean
}

/**
 * One destination in the explorer. Active state is marked by an accent rail and
 * a lifted surface rather than a filled block, so a long list of destinations
 * stays calm; the item's identity colour is carried by its icon.
 *
 * When the sidebar is collapsed the label is removed from the flow but kept in
 * a tooltip and as the accessible name, so the rail stays fully navigable by
 * keyboard and screen reader.
 */
export function SidebarNavItem({ item, collapsed }: SidebarNavItemProps) {
  const Icon = item.icon

  const link = (
    <NavLink
      to={item.path}
      end={item.path === "/"}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          "group relative flex h-8 items-center gap-2.5 rounded-md text-sm transition-chrome outline-none",
          "focus-ring",
          collapsed ? "w-8 justify-center" : "px-2",
          isActive
            ? "bg-accent font-medium text-accent-foreground before:absolute before:inset-y-1 before:-left-2 before:w-0.5 before:rounded-full before:bg-primary"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )
      }
    >
      <Icon className={cn("size-4 shrink-0", item.accentClassName)} aria-hidden />
      {collapsed ? null : (
        <>
          <span className="truncate">{item.label}</span>
          {item.pending ? (
            <span
              // A quiet marker that the destination exists but has no feature
              // behind it yet. Removed as each slice lands.
              title="Not implemented yet"
              className="ml-auto size-1 shrink-0 rounded-full bg-muted-foreground/40"
              aria-hidden
            />
          ) : null}
        </>
      )}
    </NavLink>
  )

  if (!collapsed) return link

  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}
