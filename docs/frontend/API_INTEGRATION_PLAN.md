# API Integration Plan — Narrative Mind

> Planning document. **No implementation.** How the frontend talks to the existing
> FastAPI backend. Every decision is grounded in the verified backend contract in
> [../REPOSITORY_ANALYSIS.md](../REPOSITORY_ANALYSIS.md). Read with
> [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) (which owns caching policy) and
> [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) §4–5.

---

## 1. API client architecture

Three layers, one direction of dependency — mirroring the backend's
`repositories → domain` split (architecture §2.1):

```
Query hooks (TanStack Query)      ← cache, retry policy, invalidation, loading
      │  calls
Resource functions (per entity)   ← the only place URLs/verbs/params live
      │  calls
HTTP client (fetch wrapper)       ← transport, JSON, AbortSignal, error norm, auth seam
      │
   FastAPI backend
```

### D8 — Transport: native `fetch` wrapper (not axios/ky)

- **Decision:** A ~single-module typed `httpClient` over the browser `fetch` API.
- **Reasoning:** TanStack Query already owns retry, dedupe, and loading state, so
  the transport's job shrinks to: prepend `VITE_API_BASE_URL`, set JSON headers,
  serialize/parse bodies, thread an `AbortSignal`, normalize errors, and expose one
  auth seam. axios/ky would add a dependency to re-implement capabilities we get
  elsewhere.
- **Benefits:** Zero transport dependencies; smallest possible surface to audit;
  first-class request cancellation via the `AbortSignal` Query provides.
- **Trade-offs:** We hand-write niceties axios ships (interceptors, auto-JSON). Mitigated
  because there is exactly one interceptor need (auth) and one parse path (JSON).
- **Future scalability:** The single `httpClient` is the natural home for the auth
  header, a `worldId` prefix, request-id propagation, and 401 handling — all as
  additive hooks, no call-site changes.

**Resource layer (per entity/feature).** Pure async functions:
`listCharacters(input) · getCharacter(id) · createCharacter(body) ·
updateCharacter(id, patch) · deleteCharacter(id) · linkRelationship(id, body)`.
They build the request, call `httpClient`, and return **schema-validated** typed
data. They contain no React and no caching — the frontend twin of a repository.

> **As-built (M2):** the five CRUD functions are produced by a shared factory,
> `createEntityResource({ collection, readSchema, toCreateBody, toUpdateBody,
> toListQuery })` in `shared/api/resource.ts`, rather than being written out four
> times. This is warranted because the four backend entity routers are
> byte-for-byte parallel (a verified fact, not a forecast); the per-entity
> differences are exactly the declarative arguments above. Non-CRUD endpoints
> — `/health`, the graph reads, the Character-rooted relationship write — remain
> plain hand-written resource functions, because they have no shared shape to
> factor out.
>
> The factory also enforces gotcha #4 at the boundary: `update()` refuses to send
> an empty body, and `diffForUpdate(original, next)` returns `null` when nothing
> changed so the caller can skip the request entirely.

**Query layer.** TanStack Query hooks wrap the resource functions with keys,
caching, and invalidation (see [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md)).

---

## 2. Request flow (end to end)

Reading a character list:

```
Component
  → useEntityListQuery(descriptor, {limit,offset,sort_by,order,name_contains,status})
    → queryKey = ['characters','list', normalizedInput]
    → queryFn: listCharacters(input)
        → httpClient.get('/characters', { searchParams, signal })
            → fetch(BASE + '/characters?...')
            → on !ok: parse body → throw ApiError (normalized)
            → on ok: raw JSON
        → PageSchema(CharacterReadSchema).parse(raw)   // validate + derive hasMore
        → map wire(snake_case) → domain(camelCase)
    ← Page<Character> (typed)
  ← { data, isPending, isFetching, isError, error }
```

Writing (create) is identical until the mutation resolves, at which point the
Query layer invalidates `['characters','list']` (and any affected detail key).

---

## 3. Response mapping (schema layer = single source of truth)

### D7 — Zod schemas mirror backend DTOs; types are inferred

- **Decision:** Hand-author one Zod schema set per entity mirroring the Pydantic
  triads (`Base / Create / Update / Read`), infer TypeScript types from them, and
  **validate every response at the boundary**.
- **Reasoning:** The backend's DTOs are stable and constraint-rich (name 1–120,
  aliases ≤10, `status` enum, `passage` 10–5000). One Zod schema simultaneously
  (a) generates the TS type, (b) validates API responses, and (c) validates forms
  via `@hookform/resolvers`. That is maximal DRY for one dependency.
- **Benefits:** Backend drift surfaces immediately at the seam, not three screens
  later; form rules and wire rules can't diverge; strong end-to-end typing with no
  codegen step.
- **Trade-offs:** Schemas are maintained by hand against the backend (not generated
  from its OpenAPI). Accepted because the entity set is tiny and stable, and hand
  schemas let us encode things OpenAPI omits (the `hasMore` derivation, the error
  envelope, the read-only `display_name`). *Considered alternative:*
  `openapi-typescript` codegen from FastAPI's `/openapi.json` — deferred (adds a
  build step, produces types-only with no runtime validation, and would still need
  hand-patching for the backend's serialization quirks). It remains a viable future
  swap behind the same resource-layer interface.
- **Future scalability:** New fields = one schema edit; the descriptor engine picks
  them up for table/form automatically.

### Casing anti-corruption boundary

- The wire is **snake_case** (`created_at`, `timeline_order`, `name_contains`,
  `sort_by`, `source_id`). The app is **camelCase**.
- Each `*.schema.ts` owns two mappers: `fromWire` (response → domain) and `toWire`
  (domain → request body/params). Components and hooks only ever see camelCase.
- This isolates every wire-specific quirk in one file per entity.

### Verified backend gotchas the mapping layer must absorb

Each is a fact from the analysis, with the required handling:

1. **`Page.has_more` is not serialized** (§Observations #9). The `Page` schema
   **derives** `hasMore = offset + items.length < total`. Components never look for
   a server `has_more`.
2. **Two different 422 shapes.** Domain validation returns
   `{"error":{"code":"domain_validation","message":…}}`; FastAPI request-validation
   returns `{"detail":[{loc,msg,type},…]}`. Both normalize to one `ApiError`
   (§4). Field-level `loc` paths are mapped back to form fields.
3. **`exclude_none` on PATCH** (§Service Layer). Sending `field: null` does **not**
   clear a value — the backend drops nulls. The client therefore treats optional
   fields as "cannot be nulled via PATCH"; the UI does not offer a "clear to null"
   affordance it can't honor. (Documented as a product constraint, not a bug.)
4. **Empty update is rejected (422)** (`if not self.model_fields_set`). Update
   requests send **only changed fields**, diffed against the loaded entity; if the
   diff is empty, the client short-circuits without a request.
5. **`display_name` is a read-only computed field** on Character responses. It is
   parsed for display but stripped from any `toWire` body (never echoed on write).
   *As-built (M4):* stripping is now structural rather than remembered. Every
   entity's update mapper is `pickDefined(patch, WRITABLE_FIELDS)`
   (`shared/schemas/wire.ts`), so a field reaches the wire only if it appears on
   an explicit allow-list. Computed and server-owned fields are excluded by
   omission rather than by each mapper deleting them.

> **As-built (M4) — the two write asymmetries live in one module.** Gotchas #3
> and #5 were being re-implemented per entity. Both now sit in
> `shared/schemas/wire.ts`:
>
> - `emptyToNull(value)` — **create only.** An untouched input is `""`, but these
>   fields are `str | None` defaulting to `None`, so a blank must become `null`.
> - `pickDefined(patch, writableFields)` — **update only.** The reverse rule
>   applies: `exclude_none=True` would drop a `null`, so a deliberate clear is
>   sent as `""` and passed through untouched. `undefined` means "not in this
>   patch" and is omitted.
>
> Getting either backwards silently corrupts a write — a cleared field that
> quietly keeps its old value, or an empty string stored where "not set" was
> meant. That is why they are one tested module rather than a convention each
> schema restates.
>
> **As-built (M5) — `pickDefined` also converts keys to snake_case.** Through
> Faction every writable field was a single word, so form keys and wire keys
> coincided by accident. Event's `timelineOrder` → `timeline_order` is the first
> divergence, and its failure mode is the worst kind: an unconverted key is not a
> field the backend knows, so `exclude_none` drops it and the PATCH returns 200
> having changed nothing. Converting inside the helper is safe because the whole
> backend is uniformly snake_case, and it fails safe — every future multi-word
> field is handled without anyone having to remember. Only allow-listed top-level
> keys are converted, never nested payload data (the corruption case
> `shared/lib/casing.ts` warns about).
>
> Note the create/update asymmetry is deliberate: create mappers still spell out
> wire keys, because they also apply *value* transforms (`emptyToNull`) that are
> field-specific. Update maps keys only, so it can be mechanical.
6. **`created_at` is a plain ISO string**, not a guaranteed typed datetime. The
   schema parses it as an ISO string and formatting is done defensively.
7. **Sort whitelist differs per entity and invalid sorts silently fall back to
   `name`.** The descriptor lists only the valid `sort_by` values per entity
   (`status`/`region`/`ideology`/`timeline_order` etc.), so the UI never offers an
   option the backend would ignore.
8. **Categorical filters are exact-match, and there is no distinct-values
   endpoint.** `status` is a known enum (safe as a select). `region`/`ideology`
   are exact string equality with no way to enumerate values server-side; the UI
   treats them as exact-match inputs (with values discovered from loaded data as an
   aid), and positions `name_contains` as the primary discovery filter.
   *As-built (M4):* Faction's `ideology` is the third instance and needed no new
   code — `kind: "text"`, same as `region`.
   *As-built (M4):* this is the `EntityFilterSpec` `kind` discriminator —
   `status` is `kind: "select"`, `region` is `kind: "text"` (a debounced input).
   Suggesting values from loaded data was **not** built: the only values available
   client-side are those on the current page, which is circular once a filter is
   applied. It needs a distinct-values endpoint to be worth doing.
10. **The two `/graph` reads are the only untyped backend surface.** Both handlers
   are declared `-> dict`, so FastAPI generates no response model and there is no
   OpenAPI shape to lean on — Zod validation at this boundary is the only thing
   between a changed Cypher projection and a crash inside the renderer.

   > **Resolved (M5).** This entry previously read: *"the ego-network response
   > contains no relationships at all — only reachable nodes,"* which forced the
   > client to infer adjacency at depth 1 and draw nothing beyond it. The
   > endpoint now projects the **induced subgraph** — every relationship whose
   > endpoints both appear in the node set, with `source`, `target`, `rel_type`,
   > and `sentiment`. Edges are facts at every depth, and `edgesAreComplete` is
   > true whenever the field is present.
   >
   > The projection is a second pass over the resolved node set, not a projection
   > of the traversal's paths. Collecting `relationships(path)` would report only
   > edges lying on a path outward from the centre, which omits edges *between*
   > neighbours — at depth 1 it would return no neighbour-to-neighbour edge at
   > all, drawing a star where the data holds a triangle.
   >
   > The client still distinguishes `relationships: null` (the field is absent —
   > an older backend) from `[]` (projected, and there are none), and keeps the
   > depth-1 inference as the fallback for the former. Claiming a complete edge
   > set against a backend that cannot report one would be the exact dishonesty
   > the original constraint was handled to avoid.

9. **Relationships are Character-rooted** (`POST /characters/{id}/relationships`),
   `rel_type ∈ {KNOWS, MEMBER_OF, LOCATED_IN, PARTICIPATED_IN}`, `sentiment`
   meaningful only for `KNOWS`, and the backend does **not** enforce target type
   (§Observations #8). The UI guides valid pairings (MEMBER_OF→Faction,
   LOCATED_IN→Location, PARTICIPATED_IN→Event, KNOWS→Character) while staying
   tolerant of what the backend allows.

   > **As-built (M5).** "Character-rooted" is enforced by the Cypher
   > (`MATCH (source:Character {id: $source_id})`), not merely conventional — a
   > Faction id as source matches nothing and the write 404s. That single fact
   > shapes the whole feature's UX: the entity a relationship dialog is opened
   > from cannot always be the source, so it carries a **role**. From a Character
   > it pins the source; from a Location, Faction, or Event it pins the *target*
   > and the writer picks the character. Both cases prefill exactly one end.
   >
   > Target-type guidance is expressed by making the chosen `rel_type` decide
   > which collection the target picker searches. Because each type points at a
   > distinct entity kind, that also means a pinned target of a given kind admits
   > exactly one type — from a Faction page the only expressible statement is
   > `MEMBER_OF`, so the type control is settled rather than offered.
   >
   > There is **no endpoint that lists an entity's relationships**, and no
   > endpoint that enumerates the valid `rel_type` values (they live in
   > `_ALLOWED_REL_TYPES`, a Python constant). The catalog is therefore
   > client-side, behind a `useRelationshipTypes()` seam so a future
   > backend-driven list changes one file rather than every component that
   > renders a type.

---

## 4. Error handling

### Normalized error model

Every failure becomes one shape, produced in `shared/api/api-error.ts`:

```
ApiError {
  status: number
  code: 'not_found' | 'conflict' | 'domain_validation' | 'bad_request'
        | 'validation' | 'network' | 'timeout' | 'unknown'
  message: string            // human-readable, safe to toast
  fieldErrors?: Record<string, string>   // from FastAPI 'detail' loc paths
  cause?: unknown
}
```

Mapping rules (from the verified error contract, §Error Handling):

| Source | Detection | Normalized `code` | Routed to |
|---|---|---|---|
| Domain envelope `{error:{code}}` | body has `error.code` | that code (`not_found`/`conflict`/`domain_validation`/`bad_request`) | toast; 404 → not-found UI |
| FastAPI validation | HTTP 422 + body has `detail[]` | `validation` + `fieldErrors` | form `setError` per field |
| Network failure / abort | fetch throws / `AbortError` | `network` / (abort ignored) | toast (or silent on abort) |
| Timeout | client-side deadline | `timeout` | toast + retry affordance |
| Anything else | fallback | `unknown` | toast + error boundary if fatal |

- **Placement of handling:**
  - *Field/validation errors* → surfaced inline on the form (RHF), never a toast.
  - *Domain + transport errors* → non-blocking toast (shadcn Sonner) from a shared
    mutation error handler; read errors render an `ErrorState` in place with retry.
  - *Render-time failures* → `AppErrorBoundary` (recovery UI, shell survives).

> **As-built (M2):** this policy is implemented as
> `getErrorPresentation(error, context)` in `shared/api/error-presentation.ts`,
> returning one of `field | inline | toast | silent`. The `silent` case covers
> **canceled** requests: TanStack Query aborts in-flight reads on navigation and
> param changes, so aborts are routine and are never shown as failures. Two codes
> were added to the model beyond the table above — `canceled` (an abort) and
> `parse` (the response did not match the schema the client expected, i.e. backend
> contract drift). Failed mutations toast automatically via the QueryClient's
> `MutationCache`; a mutation opts out with `meta: { suppressErrorToast: true }`
> when it handles the error itself.
- **404 semantics:** `getEntity` 404 → a dedicated "not found" detail state (the
  entity may have been deleted in another view), with a path back to the list.
- **`conflict` (409):** defined and handled in the client even though the backend
  does not currently raise it (§Observations #2) — the seam is ready if a
  uniqueness rule is added later, at zero cost now.

---

## 5. Loading strategy

Owned by TanStack Query state, expressed through shared UI states:

- **First load:** `isPending` → skeleton (`LoadingState`, shadcn `Skeleton`) shaped
  like the target (table rows / detail fields), not a spinner — preserves layout.
- **Background refetch:** `isFetching && !isPending` → a subtle top-bar progress
  indicator; the stale-but-present data stays interactive (stale-while-revalidate).
- **Pagination/param change:** `placeholderData` (keep-previous) so the current
  page/detail stays on screen during the next fetch — no flash, IDE-smooth.
- **Mutations:** optimistic where safe (see §pagination/optimism below); a pending
  affordance on the triggering control; success/failure via toast.
- **Route transitions:** feature routes are `React.lazy` + `Suspense`; a route-level
  fallback keeps the shell (sidebar/status bar) mounted while a feature chunk loads.
- **Global read model:** default `staleTime` is a few seconds (data changes are
  user-driven and low-frequency), so navigation feels instant while edits still
  reconcile promptly on invalidation.

---

## 6. Pagination

- **Model:** offset-based, mirroring the backend exactly — `limit` (default 20,
  `1..100`) and `offset` (`≥0`), returning `{items,total,limit,offset}` and the
  **client-derived `hasMore`** (§3, gotcha #1).
- **State home:** list params live in the **URL** (`?limit&offset&sort_by&order&
  name_contains&<categorical>`), so pages are deep-linkable and back/forward work
  (see [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) §URL state). The query key is
  derived from these params.
- **Primary UX:** windowed pagination (prev/next + page size) using `hasMore` and
  `total` — precise and honest about position, fitting a professional tool.
- **Secondary UX (optional, deferred):** `useInfiniteQuery` for scroll-heavy views
  (e.g., an entity picker), also offset-based (`getNextPageParam` computes the next
  `offset` from `hasMore`). Offered as an available pattern, not a default.
- **Cross-page mutation coherence:** after create/delete, list keys are invalidated
  rather than surgically patched, because `total` and page membership shift; detail
  keys are patched optimistically.

> **As-built (M3) — where the optimism line was actually drawn:**
> create and delete are **not** optimistic, because both change `total` and page
> membership; a predicted list would be visibly wrong (a row in the wrong sort
> position, a stale count). Update **is** optimistic, but only on the detail key,
> where the new value is known exactly and the blast radius is one screen.
> Separately, an update whose diff is empty issues **no request at all** and
> reports "No changes to save" — it must not claim a save that never happened.

---

## 7. Retry strategy

- **Reads (GET):** TanStack Query retry with exponential backoff, but a **retry
  predicate that never retries 4xx** (`not_found`, `validation`, `bad_request`) —
  those are deterministic. Retries apply only to `network`/`timeout`/5xx. This
  avoids hammering the backend on a genuine 404/422.
- **Mutations (POST/PATCH/DELETE):** **no automatic retry.** They are not
  guaranteed idempotent from the client's view (create is not; the backend exposes
  no idempotency key), so silent replays could double-write. Retry is user-driven
  (the failed action stays actionable).
- **Cancellation:** every request receives the `AbortSignal` from Query; navigating
  away or changing params aborts in-flight reads automatically.
- **Timeout:** the `httpClient` enforces a client-side deadline (via `AbortSignal.
  timeout`) so a hung backend surfaces as `timeout` rather than an infinite spinner.
- **Health/degraded mode:** `GET /health` is polled at a low interval to drive the
  status bar; repeated transport failures flip the indicator to "offline" and the
  UI favors cached data with a reconnect affordance.

---

## 8. Future authentication compatibility (seam only — out of scope now)

No auth is implemented. The architecture leaves exactly one correctly-shaped hole:

- **`AuthTokenProvider` interface** (`shared/api/auth.ts`), injected into
  `httpClient`. Today a no-op; later it supplies a bearer token per request.
- **Cookie path already open:** backend CORS sets `allow_credentials=True`, so a
  future cookie/session scheme works by having `httpClient` send
  `credentials: 'include'` — a one-line change behind the same seam.
- **401 policy:** a single response hook maps `401 → sign-out + redirect to a
  (future) sign-in route`; `routes/guards/` is the reserved place for route
  protection.
- **Cache isolation:** on identity change, the QueryClient is reset so no data
  leaks across users. The query-key registry is the single point to add a
  per-identity or per-world prefix.
- **Nothing ships now:** these are inert interfaces and empty folders. They make
  the later addition additive and low-risk, satisfying "future compatibility
  matters, implementation does not."
