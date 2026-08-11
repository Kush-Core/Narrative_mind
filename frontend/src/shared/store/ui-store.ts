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
}

export const DEFAULT_PANEL_SIZES: PanelSizes = { explorer: 18, main: 82 }

interface UiState {
  sidebarCollapsed: boolean
  commandPaletteOpen: boolean
  panelSizes: PanelSizes

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setPanelSizes: (sizes: PanelSizes) => void
  resetLayout: () => void
}

/** The slice of {@link UiState} that survives a reload — see `partialize`. */
type PersistedUiState = Pick<UiState, "sidebarCollapsed" | "panelSizes">

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      panelSizes: DEFAULT_PANEL_SIZES,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setPanelSizes: (panelSizes) => set({ panelSizes }),
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
      version: 1,
      migrate: (persisted, version) => {
        if (version >= 1) return persisted as PersistedUiState

        const legacy = (persisted ?? {}) as {
          sidebarCollapsed?: boolean
          panelSizes?: Partial<PanelSizes>
        }
        const explorer = legacy.panelSizes?.explorer ?? DEFAULT_PANEL_SIZES.explorer

        return {
          sidebarCollapsed: legacy.sidebarCollapsed ?? false,
          panelSizes: { explorer, main: 100 - explorer },
        }
      },
      // Only geometry survives a reload; transient overlays start closed.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        panelSizes: state.panelSizes,
      }),
    },
  ),
)
