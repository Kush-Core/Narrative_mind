import type { ReactNode } from "react"
import { Link } from "react-router-dom"

import { entityKindIdentity, type NodeKind } from "@/shared/domain/entity-kinds"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"

/**
 * The one way an AI surface names an entity.
 *
 * Entity references show up in three different places — an answer's citations,
 * the retrieval trace, and the proposals from a passage — and if each rendered
 * them its own way the four features would read as four products. So there is
 * one chip, and it takes its colour and icon straight from
 * `shared/domain/entity-kinds`: the same tokens the graph canvas and the
 * sidebar already use. A Character is the same violet inside an answer as it is
 * on the canvas, which is what makes the accent *learnable* rather than
 * decorative.
 *
 * The icon is not ornament. Colour alone cannot carry the entity kind for a
 * viewer who does not distinguish these hues, so the kind is stated twice — once
 * in colour, once in shape.
 *
 * `id` is optional because `/ai/extract` returns **names with no ids**: it never
 * touches the graph, so there may be nothing to link to. Such a chip renders
 * with identical weight and simply does not navigate — a proposal is no less
 * real for not existing yet.
 */

interface EntityChipProps {
  kind: NodeKind
  name: string
  /** When present, and the kind has a detail route, the chip links to it. */
  id?: string
  /** Trailing detail — a similarity score, a "new" marker. */
  suffix?: ReactNode
  className?: string
}

export function EntityChip({ kind, name, id, suffix, className }: EntityChipProps) {
  const identity = entityKindIdentity(kind)
  const Icon = identity.icon
  const href = id !== undefined && identity.detailPath ? identity.detailPath(id) : undefined

  const content = (
    <>
      <Icon aria-hidden />
      <span className="truncate">{name}</span>
      {suffix !== undefined ? (
        <span className="font-mono text-2xs opacity-70">{suffix}</span>
      ) : null}
    </>
  )

  return (
    <Badge
      asChild={href !== undefined}
      variant="accent"
      title={`${identity.singular}: ${name}`}
      className={cn(
        "max-w-56 gap-1",
        identity.accentClassName,
        href !== undefined && "focus-ring transition-chrome hover:bg-current/20",
        className,
      )}
    >
      {href !== undefined ? <Link to={href}>{content}</Link> : content}
    </Badge>
  )
}
