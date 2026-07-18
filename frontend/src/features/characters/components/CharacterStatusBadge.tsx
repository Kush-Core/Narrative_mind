import type { CharacterStatus } from "@/features/characters/model/character.schema"
import { Badge } from "@/shared/ui/badge"

/**
 * Renders `alive` / `dead` / `unknown` with a semantic token
 * (docs/frontend/COMPONENT_HIERARCHY.md §6).
 *
 * The status→tone mapping is a domain decision, which is why it lives in the
 * feature rather than in the `Badge` primitive: the design system knows what
 * "success" looks like, not that a living character is good news.
 */

const STATUS_VARIANT: Record<CharacterStatus, "success" | "destructive" | "outline"> = {
  alive: "success",
  dead: "destructive",
  unknown: "outline",
}

const STATUS_LABEL: Record<CharacterStatus, string> = {
  alive: "Alive",
  dead: "Dead",
  unknown: "Unknown",
}

export function CharacterStatusBadge({ status }: { status: CharacterStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
}
