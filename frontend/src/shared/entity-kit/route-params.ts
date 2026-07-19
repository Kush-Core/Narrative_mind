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
