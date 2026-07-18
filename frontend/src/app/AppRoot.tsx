import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { RouterProvider } from "react-router-dom"

import { AppErrorBoundary } from "@/app/error/AppErrorBoundary"
import { createQueryClient } from "@/app/providers/query-client"
import { router } from "@/routes/router"
import { Toaster } from "@/shared/ui/sonner"
import { TooltipProvider } from "@/shared/ui/tooltip"

/**
 * Composition root — the only place providers are wired
 * (docs/frontend/FRONTEND_ARCHITECTURE.md §3).
 *
 * The command/keyboard provider is *not* here: it needs router context to
 * navigate, so it is mounted by `WorkspaceLayout` inside the route tree. No
 * theme provider exists by design — the app is dark-only and locks the class in
 * `index.html` (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.1).
 */
export function AppRoot() {
  const [queryClient] = useState(createQueryClient)

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          <RouterProvider router={router} />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
