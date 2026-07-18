import { InboxIcon } from "lucide-react"

import { StatePanel, type StatePanelProps } from "@/shared/ui/composite/StatePanel"

/**
 * "There is nothing here yet" — the *expected* absence of data, and usually an
 * invitation to create the first one. Distinct from `ErrorState`, which means
 * something went wrong.
 */
export function EmptyState({ icon = InboxIcon, ...props }: StatePanelProps) {
  return <StatePanel icon={icon} {...props} />
}
