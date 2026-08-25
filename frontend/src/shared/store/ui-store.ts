/**
 * Global UI state (docs/frontend/STATE_MANAGEMENT.md §4).
 *
 * This store holds *workspace chrome* only: which panels are open, how wide
 * they are, and whether the command palette is showing. The hard rule from the
 * state strategy applies here — **no server data and nothing the URL owns ever
 * lands in this store.** If a value can be derived from the Query cache or from
 * the address bar, it is derived, not stored.
 *
 * Panel geometry is persisted, because a workspace that forgets its layout on
 * reload is not a workspace. Palette visibility is not: it is ephemeral by
 * definition.
 *
 * (New folder relative to the file-structure doc, which predates the store's
 * existence; it sits in `shared/` because the shell and, later, feature screens
 * both read panel state.)
 */

import { create } from "zustand"
import { persist } from "zustand/middleware"

/** Percentage widths of the resizable workspace panels. */
export interface PanelSizes {
  explorer: number
  main: number
  /** The auxiliary right panel — today, the Ask dock. */
  aux: number
}

/**
 * Proportions with *everything* showing. What a given arrangement actually
 * hands the panel group is derived by `resolvePanelLayout`, because a layout
 * map is read as percentages of the panels that are rendered.
 */
export const DEFAULT_PANEL_SIZES: PanelSizes = { explorer: 18, main: 60, aux: 22 }

/**
 * The layout map for one arrangement of panels.
 *
 * The panel group divides its width among the panels it is *given*, so a map
 * carrying a size for a panel that is not rendered leaves the layout short of
 * 100% and the visible panels short of the width they asked for. (That is the
 * bug the v0 to v1 migration below was written to clean up after; deriving the
 * map instead of storing one per arrangement is what stops it recurring now
 * that a third panel can come and go.)
 *
 * So the stored sizes are treated as *ratios*, and only the rendered ones are
 * normalized to 100.
 */
export function resolvePanelLayout(
  sizes: PanelSizes,
  visible: { explorer: boolean; aux: boolean },
): Record<string, number> {
  const entries: [string, number][] = []
  if (visible.explorer) entries.push(["explorer", sizes.explorer])
  entries.push(["main", sizes.main])
  if (visible.aux) entries.push(["aux", sizes.aux])

  const total = entries.reduce((sum, [, value]) => sum + value, 0)
  return Object.fromEntries(entries.map(([id, value]) => [id, (value / total) * 100]))
}

interface UiState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  /**
   * Whether the Ask dock is showing. Persisted, unlike palette visibility: a
   * dock is a place the user chose to keep open, not a transient overlay.
   */
  askDockOpen: boolean
  panelSizes: PanelSizes

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setAskDockOpen: (open: boolean) => void
  toggleAskDock: () => void
  /** Merges — a drag only reports the panels currently on screen. */
  setPanelSizes: (sizes: Partial<PanelSizes>) => void
  resetLayout: () => void
}

/** The slice of {@link UiState} that survives a reload — see `partialize`. */
type PersistedUiState = Pick<UiState, "sidebarCollapsed" | "panelSizes" | "askDockOpen">

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      askDockOpen: false,
      panelSizes: DEFAULT_PANEL_SIZES,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setAskDockOpen: (askDockOpen) => set({ askDockOpen }),
      toggleAskDock: () => set((state) => ({ askDockOpen: !state.askDockOpen })),
      setPanelSizes: (panelSizes) =>
        set((state) => ({ panelSizes: { ...state.panelSizes, ...panelSizes } })),
      resetLayout: () =>
        set({
          panelSizes: DEFAULT_PANEL_SIZES,
          sidebarCollapsed: false,
        }),
    }),
    {
      name: "narrative-mind:workspace-layout",
      // v0 stored a third `aux` panel for the auxiliary inspector, which no
      // longer exists. Its width has to be dropped rather than merely ignored:
      // the stored map is handed to the panel group as its default layout, and
      // a size for a panel id that is not rendered leaves the layout short of
      // 100%. The explorer keeps its width and main absorbs the rest.
      // v2 re-adds an auxiliary panel (`aux`, the Ask dock) after v1 removed
      // the original one. Both older shapes are handled by the same arm: only
      // the explorer's width was ever the user's own decision, so it is carried
      // across and the rest is rebuilt from the defaults.
      version: 2,
      migrate: (persisted, version) => {
        if (version >= 2) return persisted as PersistedUiState

        const legacy = (persisted ?? {}) as {
          sidebarCollapsed?: boolean
          panelSizes?: Partial<PanelSizes>
        }
        const explorer = legacy.panelSizes?.explorer ?? DEFAULT_PANEL_SIZES.explorer
        const aux = DEFAULT_PANEL_SIZES.aux

        return {
          sidebarCollapsed: legacy.sidebarCollapsed ?? false,
          panelSizes: { explorer, main: Math.max(30, 100 - explorer - aux), aux },
          askDockOpen: false,
        }
      },
      // Only geometry and the dock survive a reload; transient overlays start
      // closed.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        panelSizes: state.panelSizes,
        askDockOpen: state.askDockOpen,
      }),
    },
  ),
)
