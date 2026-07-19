/**
 * The URL param name every entity detail route binds its id to.
 *
 * Shared by `routes/router.tsx` (which builds the path) and `EntityDetailPage`
 * (which reads it), so the two agree by construction rather than by convention.
 * A mismatch would compile and route cleanly, then fail at runtime with an
 * undefined id.
 *
 * **This module is deliberately dependency-free.** The router is part of the
 * eager bundle; importing the constant from `EntityCrudPages` instead would pull
 * the whole entity-kit — table, forms, dialogs, ~137 kB — out of its lazy chunk
 * and into initial load. A leaf module keeps the constant shared and the weight
 * lazy. Do not add imports here.
 */
export const ENTITY_ID_PARAM = "id"

/**
 * Search param that asks a detail screen to open its edit dialog on arrival.
 *
 * Editing is a *navigable* state, not a transient one: making it addressable
 * means anything that can link can also send someone straight into the edit
 * form. The graph's "Edit entity" action is the first caller — it deliberately
 * routes to the entity's own screen rather than embedding the edit dialog,
 * which would drag all four CRUD slices into the lazy graph chunk.
 *
 * Consistent with D6 (the URL owns navigable view state), and it makes edit
 * deep-linkable for every entity type at once.
 */
export const ENTITY_EDIT_PARAM = "edit"

/** Append the edit intent to an entity detail path. */
export function withEditIntent(detailPath: string): string {
  return `${detailPath}?${ENTITY_EDIT_PARAM}=1`
}
