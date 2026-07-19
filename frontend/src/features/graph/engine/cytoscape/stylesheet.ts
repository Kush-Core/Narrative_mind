/**
 * Cytoscape styling, driven by the app's design tokens.
 *
 * Cytoscape paints to a `<canvas>`, so it cannot consume Tailwind classes — it
 * needs concrete colour strings. Rather than duplicating token values here (which
 * would drift the moment `tokens.css` is retuned), the tokens are **resolved at
 * runtime** from the document's computed styles. `styles/tokens.css` stays the
 * single source of colour, exactly as the design system requires
 * (docs/frontend/COMPONENT_HIERARCHY.md §2).
 *
 * The stylesheet is built once per renderer instance, after mount, when the
 * custom properties are guaranteed to be resolvable.
 */

import type { StylesheetStyle } from "cytoscape"

import { ENTITY_KIND_IDENTITIES, entityKindIdentity } from "@/shared/domain/entity-kinds"

/**
 * Resolve a design token to a colour Cytoscape can actually paint.
 *
 * **Not** `getComputedStyle(root).getPropertyValue(name)`. That returns the
 * token's *authored* text, and this app's tokens are authored in `oklch()`
 * (`styles/tokens.css`). Cytoscape parses hex/rgb/hsl/named colours only — it
 * has no `oklch` support — so handing it the raw value silently fails to parse
 * and every node paints in the default grey while the DOM legend beside it shows
 * the real colours. The graph looked plausible and was wrong, which is the worst
 * kind of wrong.
 *
 * So the conversion is delegated to the browser: assign the variable to a probe
 * element's `color` and read the *computed* value back, which the CSSOM
 * guarantees is a resolved `rgb()` / `rgba()` string regardless of the colour
 * space it was authored in. One probe, reused for every token, removed
 * immediately.
 *
 * Falls back rather than throwing: a missing or unresolvable token should cost a
 * colour, not the whole graph. (In a non-browser environment — jsdom, SSR —
 * `var()` does not resolve, so every token takes its fallback. Real colour
 * resolution is verified in a browser, not in the unit suite.)
 */
/**
 * Marker colour substituted when a token does not exist.
 *
 * Distinctive enough that a real token will never collide with it, so a missing
 * variable is detectable rather than silently painting the inherited colour.
 */
const MISSING_TOKEN = "rgb(1, 2, 3)"

function createTokenResolver(): (name: string, fallback: string) => string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return (_name, fallback) => fallback
  }

  const probe = document.createElement("span")
  probe.style.display = "none"
  document.body.appendChild(probe)

  const canvas = document.createElement("canvas")
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext("2d")

  const resolve = (name: string, fallback: string): string => {
    probe.style.color = `var(${name}, ${MISSING_TOKEN})`
    const computed = getComputedStyle(probe).color.trim()
    // No CSSOM resolution at all (jsdom, SSR).
    if (computed === "" || !ctx) return fallback

    // Rasterize. This is the step that actually matters: Chrome returns the
    // computed value *in its authored colour space* — an `oklch()` token reads
    // back as `oklch(...)` from both `getComputedStyle` and `ctx.fillStyle` —
    // and Cytoscape cannot parse that. Painting one pixel forces the engine
    // through its own colour conversion and yields plain sRGB channels, whatever
    // space the token was written in.
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = computed
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data

    if (r === undefined || g === undefined || b === undefined || a === undefined) return fallback
    // The sentinel came back, so the variable is not defined.
    if (r === 1 && g === 2 && b === 3) return fallback

    return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
  }

  // Every caller runs synchronously inside `buildStylesheet`, so the probe can
  // be torn down as soon as this function returns.
  resolve.dispose = () => probe.remove()
  return resolve
}

export function buildStylesheet(): StylesheetStyle[] {
  const resolver = createTokenResolver()
  const token = (name: string, fallback: string) => resolver(name, fallback)
  try {
    return buildRules(token)
  } finally {
    ;(resolver as { dispose?: () => void }).dispose?.()
  }
}

function buildRules(token: (name: string, fallback: string) => string): StylesheetStyle[] {
  const foreground = token("--foreground", "#e8e8ea")
  const muted = token("--muted-foreground", "#9b9ba3")
  const border = token("--border", "#2a2a30")
  const ring = token("--ring", "#7c7cf0")
  const surface = token("--background", "#121215")

  const base: StylesheetStyle[] = [
    {
      selector: "node",
      style: {
        "background-color": token(entityKindIdentity("Unknown").accentVar, muted),
        "border-width": 2,
        "border-color": surface,
        width: 34,
        height: 34,
        label: "data(label)",
        color: foreground,
        "font-size": 11,
        "font-family": "inherit",
        "text-valign": "bottom",
        "text-margin-y": 6,
        "text-wrap": "ellipsis",
        // Keeps long names from colliding in a dense network.
        "text-max-width": "120px",
        "text-background-color": surface,
        "text-background-opacity": 0.75,
        "text-background-padding": "2px",
        "text-background-shape": "roundrectangle",
        "transition-property": "border-color, border-width, opacity",
        "transition-duration": 120,
      },
    },

    /* The centre of the ego network: larger, ringed, label always legible. */
    {
      selector: "node[?isFocus]",
      style: {
        width: 52,
        height: 52,
        "border-width": 3,
        "border-color": ring,
        "font-size": 13,
        "z-index": 10,
      },
    },

    /**
     * A node the backend reported as reachable but whose connections it did not
     * return. Drawn dimmed and dashed-ringed so "no edge" reads as *unknown*
     * rather than *unconnected* — the visual counterpart of `edgesAreComplete`.
     */
    {
      selector: "node[?isUnlinked]",
      style: {
        "border-width": 2,
        "border-color": border,
        "border-style": "dashed",
        opacity: 0.75,
      },
    },

    {
      selector: "edge",
      style: {
        width: 1.5,
        "line-color": border,
        "curve-style": "straight",
        "target-arrow-shape": "none",
        opacity: 0.9,
        "transition-property": "line-color, width, opacity",
        "transition-duration": 120,
      },
    },

    /* Selection is a renderer concern only in appearance; the authoritative
       selection lives in application state. */
    {
      selector: "node:selected",
      style: {
        "border-width": 4,
        "border-color": ring,
        "z-index": 20,
      },
    },
    {
      selector: "edge:selected",
      style: {
        width: 3,
        "line-color": ring,
        opacity: 1,
      },
    },
  ]

  /**
   * One rule per entity kind, so a Character is the same violet in the graph as
   * in the table and the sidebar. Generated from the shared identity registry
   * rather than restated, which is what keeps the three surfaces in agreement.
   */
  const kindStyles: StylesheetStyle[] = ENTITY_KIND_IDENTITIES.map((identity) => ({
    selector: `node[kind = "${identity.kind}"]`,
    style: {
      "background-color": token(identity.accentVar, muted),
    },
  }))

  // Kind colours come first so the focus/unlinked rules layer on top of them.
  return [...base.slice(0, 1), ...kindStyles, ...base.slice(1)]
}
