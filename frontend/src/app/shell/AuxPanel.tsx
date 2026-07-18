import { PanelRightCloseIcon, SquareDashedIcon } from "lucide-react"

import { useUiStore } from "@/shared/store/ui-store"
import { Button } from "@/shared/ui/button"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"
import { ScrollArea } from "@/shared/ui/scroll-area"

/**
 * The auxiliary inspector — the right-hand panel of the master/detail split
 * (docs/frontend/COMPONENT_HIERARCHY.md §7).
 *
 * Structural only at this stage: it owns its own chrome and empty state, and
 * feature screens will fill it by rendering into it. It is deliberately a
 * *shell* region rather than a feature-owned panel, so every screen that wants
 * an inspector gets the same one.
 */
export function AuxPanel() {
  const closeAuxPanel = useUiStore((state) => state.setAuxPanelOpen)

  return (
    <aside
      aria-label="Inspector"
      className="flex h-full min-h-0 flex-col border-l bg-sidebar text-sidebar-foreground"
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <SectionLabel>Inspector</SectionLabel>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => closeAuxPanel(false)}
          aria-label="Hide inspector"
        >
          <PanelRightCloseIcon aria-hidden />
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <EmptyState
          icon={SquareDashedIcon}
          title="Nothing selected"
          description="Details about the item you select will appear here."
        />
      </ScrollArea>
    </aside>
  )
}
