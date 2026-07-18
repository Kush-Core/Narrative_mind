/**
 * World navigator (left panel). Foundation stage: structural only — entity
 * groups, counts, and create actions arrive with the entity slices (M3/M4);
 * resizing arrives with M1 (docs/frontend/COMPONENT_HIERARCHY.md §7).
 */
export function ExplorerSidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
      <div className="px-4 pt-4 pb-2">
        <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
          Explorer
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center px-6">
        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Your world&rsquo;s characters, locations, factions, and events will appear here.
        </p>
      </div>
    </aside>
  )
}
