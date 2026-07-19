import { Badge } from "@/shared/ui/badge"

/**
 * Renders a location's region, or its absence
 * (docs/frontend/COMPONENT_HIERARCHY.md §6).
 *
 * The Character counterpart maps a closed enum to a semantic tone; region has
 * no such mapping to make, because it is free text. What this component *does*
 * own is the domain decision that a region-less location is a normal, unfinished
 * state rather than missing data — so it reads as a quiet "Unassigned" instead
 * of an em dash, and stays visually distinct from a real region.
 */
export function RegionBadge({ region }: { region: string | null }) {
  if (!region) {
    return <span className="text-xs text-muted-foreground">Unassigned</span>
  }

  return <Badge variant="secondary">{region}</Badge>
}
