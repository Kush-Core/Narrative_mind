import { QueryClientProvider } from "@tanstack/react-query"
import { useState } from "react"
import { RouterProvider } from "react-router-dom"

import { AppErrorBoundary } from "@/app/error/AppErrorBoundary"
import { createQueryClient } from "@/app/providers/query-client"
import { router } from "@/routes/router"

/**
 * Composition root — the only place providers are wired
 * (docs/frontend/FRONTEND_ARCHITECTURE.md §3). The command/keyboard provider
 * and toaster join this stack in M1/M2.
 */
export function AppRoot() {
  const [queryClient] = useState(createQueryClient)

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppErrorBoundary>
  )
}
