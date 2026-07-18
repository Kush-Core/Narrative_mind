import { Badge } from "@/shared/ui/badge"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * Displays a character's alias set on the detail screen
 * (docs/frontend/COMPONENT_HIERARCHY.md §6).
 *
 * Fills the descriptor's `detail` slot. Aliases are identity, not incidental
 * data — the backend even folds the first one into `display_name` — so they get
 * their own labelled section rather than the generic comma-joined field
 * rendering.
 */
export function AliasList({ aliases }: { aliases: string[] }) {
  if (aliases.length === 0) return null

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <SectionLabel>Also known as</SectionLabel>
      <ul className="flex flex-wrap gap-1.5">
        {aliases.map((alias, index) => (
          <li key={alias}>
            <Badge variant={index === 0 ? "default" : "secondary"}>
              {alias}
              {index === 0 ? (
                <span className="sr-only"> (primary alias, used in the display name)</span>
              ) : null}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}
