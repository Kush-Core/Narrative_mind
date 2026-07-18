import { ArrowRightIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { navSections } from "@/app/shell/navigation"
import { appConfig } from "@/shared/config/env"
import { cn } from "@/shared/lib/utils"
import { useUiStore } from "@/shared/store/ui-store"
import { Button } from "@/shared/ui/button"
import { KeyboardHint } from "@/shared/ui/composite/Kbd"
import { PageHeader } from "@/shared/ui/composite/PageHeader"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * The landing surface for an empty workspace, replaced by the world
 * `OverviewPage` in M7 (docs/frontend/IMPLEMENTATION_PLAN.md).
 *
 * Deliberately not a dashboard of empty statistics: it teaches the workspace —
 * where things live and how to reach them by keyboard — which is what is
 * genuinely true and useful before any data exists.
 */
export function WorkspaceWelcome() {
  const openPalette = useUiStore((state) => state.setCommandPaletteOpen)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Your world"
        description="A workspace for building, understanding, and reasoning about fictional worlds."
        actions={
          <Button variant="outline" size="sm" onClick={() => openPalette(true)}>
            Open command palette
            <KeyboardHint shortcut="mod+k" />
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {/* Left-aligned rather than centred, so the content sits on the same
            axis as the page header above it. */}
        <div className="flex max-w-3xl flex-col gap-6">
          {navSections
            .filter((section) => section.id !== "world")
            .map((section) => (
              <section key={section.id} className="flex flex-col gap-2">
                <SectionLabel>{section.label}</SectionLabel>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {section.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <li key={item.id}>
                        <Link
                          to={item.path}
                          className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 focus-ring transition-chrome outline-none hover:border-ring/40 hover:bg-accent/40"
                        >
                          <Icon
                            className={cn("size-4 shrink-0", item.accentClassName)}
                            aria-hidden
                          />
                          <span className="truncate text-sm font-medium">{item.label}</span>
                          {item.shortcut ? (
                            <KeyboardHint shortcut={item.shortcut} className="ml-auto" />
                          ) : (
                            <ArrowRightIcon
                              className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                              aria-hidden
                            />
                          )}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}

          {appConfig.isDev ? (
            <p className="text-xs text-muted-foreground">
              Development build ·{" "}
              <a
                href={appConfig.apiDocsUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-sm text-foreground underline underline-offset-4 focus-ring"
              >
                backend API docs
              </a>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
