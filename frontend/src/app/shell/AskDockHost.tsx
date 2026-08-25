import { lazy, Suspense } from "react"

import { Dialog, DialogContent, DialogTitle } from "@/shared/ui/dialog"

/**
 * Where the Ask dock attaches to the workspace.
 *
 * **Lazy, and that is the whole reason this file exists.** `WorkspaceLayout` is
 * eager — it is the shell every signed-in view renders inside — so importing
 * the AI slice from it directly would put Ask, Extract, and their schemas in the
 * initial bundle for every visitor, whether or not they ever open the dock.
 * Routing the import through `React.lazy` keeps the slice in its own chunk,
 * fetched the first time the dock is opened.
 *
 * (The route tree uses React Router's own `lazy` for the same purpose. This is
 * not a route, so it uses React's.)
 */

const AskDock = lazy(async () => {
  const { AskDock: Component } = await import("@/features/ai")
  return { default: Component }
})

interface AskDockHostProps {
  onClose: () => void
}

/**
 * The docked form: a panel in the workspace's own layout.
 *
 * The fallback is deliberately blank rather than a spinner. The chunk is small
 * and usually arrives within a frame or two, and a loading indicator that
 * flashes for 30ms is worse than a panel that simply appears.
 */
export function AskDockPanel({ onClose }: AskDockHostProps) {
  return (
    <Suspense fallback={<div className="h-full border-l bg-background" />}>
      <AskDock onClose={onClose} />
    </Suspense>
  )
}

/**
 * The compact form: a full-height overlay from the right.
 *
 * Below `lg` there is no room to divide — a third column would leave both it and
 * the work surface too narrow to use. This is the structural change
 * `useMediaQuery` exists for, and it is the *only* breakpoint in the AI
 * surfaces: everything else stays itself and simply narrows, as the workspace
 * does everywhere else.
 */
export function AskDockOverlay({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-0 right-0 left-auto flex h-dvh w-full max-w-md translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 sm:max-w-md"
      >
        {/* Radix requires an accessible title on every dialog; the dock draws
            its own visible header, so this one is for assistive tech only. */}
        <DialogTitle className="sr-only">Ask the world</DialogTitle>
        <Suspense fallback={null}>
          <AskDock onClose={() => onOpenChange(false)} />
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
