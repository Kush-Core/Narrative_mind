import { ENTITY_KIND_IDENTITIES } from "@/shared/domain/entity-kinds"
import { cn } from "@/shared/lib/utils"

/**
 * The node-colour key.
 *
 * Generated from the shared identity registry, so it cannot drift from what the
 * canvas actually paints — both read the same source. The swatch uses the
 * Tailwind accent class while the canvas resolves the same token as a colour
 * string; one definition, two rendering targets.
 */
export function GraphLegend({ className }: { className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {ENTITY_KIND_IDENTITIES.map((identity) => (
        <li key={identity.kind} className="flex items-center gap-1.5">
          <span
            className={cn("size-2 rounded-full bg-current", identity.accentClassName)}
            aria-hidden
          />
          <span className="text-2xs text-muted-foreground">{identity.singular}</span>
        </li>
      ))}
    </ul>
  )
}
