import type { ReactNode } from "react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/ui/card"

interface AuthPageLayoutProps {
  title: string
  description: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * The shared frame for the login and register screens: centred card, dark
 * workspace background, app identity above it. Neither page mounts inside
 * `WorkspaceLayout` (there is nothing to navigate until a session exists), so
 * this stands in for the shell chrome those routes don't have.
 */
export function AuthPageLayout({ title, description, children, footer }: AuthPageLayoutProps) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-background p-4 text-foreground">
      <span className="text-sm font-semibold tracking-tight select-none">Narrative Mind</span>

      <Card className="w-full max-w-sm">
        <CardHeader className="gap-1.5 pb-2">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>

      {footer ? <div className="text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  )
}
