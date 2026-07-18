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
  aux: number
}

export const DEFAULT_PANEL_SIZES: PanelSizes = { explorer: 18, main: 60, aux: 22 }

interface UiState {
  sidebarCollapsed: boolean
  auxPanelOpen: boolean
  commandPaletteOpen: boolean
  panelSizes: PanelSizes

  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleAuxPanel: () => void
  setAuxPanelOpen: (open: boolean) => void
  setCommandPaletteOpen: (open: boolean) => void
  toggleCommandPalette: () => void
  setPanelSizes: (sizes: PanelSizes) => void
  resetLayout: () => void
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      auxPanelOpen: false,
      commandPaletteOpen: false,
      panelSizes: DEFAULT_PANEL_SIZES,

      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleAuxPanel: () => set((state) => ({ auxPanelOpen: !state.auxPanelOpen })),
      setAuxPanelOpen: (auxPanelOpen) => set({ auxPanelOpen }),
      setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      setPanelSizes: (panelSizes) => set({ panelSizes }),
      resetLayout: () =>
        set({
          panelSizes: DEFAULT_PANEL_SIZES,
          sidebarCollapsed: false,
          auxPanelOpen: false,
        }),
    }),
    {
      name: "narrative-mind:workspace-layout",
      // Only geometry survives a reload; transient overlays start closed.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        auxPanelOpen: state.auxPanelOpen,
        panelSizes: state.panelSizes,
      }),
    },
  ),
)
