import { appConfig } from "@/shared/config/env"

/**
 * Ambient system truth (bottom bar). Foundation stage: static identity and
 * API target. M1 wires the live /health indicator
 * (docs/frontend/IMPLEMENTATION_PLAN.md M1).
 */
export function StatusBar() {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t px-3 text-xs text-muted-foreground">
      <span>
        {appConfig.appName} · {appConfig.mode}
      </span>
      <span>API · {appConfig.apiHost}</span>
    </footer>
  )
}
