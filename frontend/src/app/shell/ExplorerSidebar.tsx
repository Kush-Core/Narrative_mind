import { navSections } from "@/app/shell/navigation"
import { SidebarNavItem } from "@/app/shell/SidebarNavItem"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/store/ui-store"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"
import { ScrollArea } from "@/shared/ui/scroll-area"

/**
 * The world navigator — the workspace's "always there" spatial anchor
 * (docs/frontend/COMPONENT_HIERARCHY.md §7).
 *
 * It renders the navigation model and nothing else: no entity knowledge lives
 * here, so entity slices landing later add themselves by appearing in
 * `navigation.ts`. Live counts and create actions attach to these same items in
 * M4 without changing this component's shape.
 *
 * Collapsing is *not* controlled from here — the command bar owns that toggle,
 * so there is exactly one control for it rather than two that must agree.
 */
export function ExplorerSidebar() {
  const collapsed = useUiStore((state) => state.sidebarCollapsed)

  return (
    <nav
      aria-label="Workspace navigation"
      data-collapsed={collapsed}
      className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground"
    >
      <ScrollArea className="min-h-0 flex-1">
        <div className={cn("flex flex-col gap-4 py-3", collapsed ? "items-center px-2" : "px-3")}>
          {navSections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1">
              {collapsed ? (
                <div className="mx-auto my-1 h-px w-5 bg-border" aria-hidden />
              ) : (
                <SectionLabel className="px-2 pb-1">{section.label}</SectionLabel>
              )}
              {section.items.map((item) => (
                <SidebarNavItem key={item.id} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </div>
      </ScrollArea>
    </nav>
  )
}
