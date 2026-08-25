import { describe, expect, it } from "vitest"

import {
  askWorld,
  describeEntity,
  extractFromPassage,
  retrieveForQuestion,
} from "@/features/ai/api/ai.api"
import { isApiError } from "@/shared/api/api-error"
import { domainError, postJson, server, validationError } from "@/test/msw/server"

const ARIA_ID = "3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8"
const WATCH_ID = "9c810f23-4a5b-4c6d-9e0f-1a2b3c4d5e6f"

/** A `RetrievalResult` exactly as `domain/rag.py` serializes it. */
const wireRetrieval = {
  seeds: [{ id: ARIA_ID, label: "Character", name: "Aria Vane", score: 0.71 }],
  entities: [
    { id: ARIA_ID, label: "Character", name: "Aria Vane", score: 0.71 },
    { id: WATCH_ID, label: "Location", name: "Kestrelwatch", score: null },
  ],
  relationships: [{ source: ARIA_ID, target: WATCH_ID, rel_type: "LOCATED_IN", sentiment: null }],
  context: `[${ARIA_ID}] Character: Aria Vane`,
  char_count: 62,
}

describe("describeEntity", () => {
  it("posts the name, traits, and a fixed neutral tone", async () => {
    let body: unknown
    server.use(
      postJson("/ai/describe", async ({ request }) => {
        body = await request.json()
        return Response.json({ description: "A watchful woman." })
      }),
    )

    const result = await describeEntity({ name: "Aria Vane", traits: ["alive"] })

    expect(body).toEqual({ name: "Aria Vane", traits: ["alive"], tone: "neutral" })
    expect(result.description).toBe("A watchful woman.")
  })
})

describe("extractFromPassage", () => {
  it("maps entity types to node kinds and renames relationship endpoints", async () => {
    server.use(
      postJson("/ai/extract", () =>
        Response.json({
          entities: [
            { name: "Aria Vane", type: "Character" },
            { name: "Kestrelwatch", type: "Location" },
          ],
          relationships: [{ source: "Aria Vane", rel_type: "LOCATED_IN", target: "Kestrelwatch" }],
        }),
      ),
    )

    const result = await extractFromPassage({ passage: "Aria rode to Kestrelwatch." })

    expect(result.entities).toEqual([
      { name: "Aria Vane", kind: "Character" },
      { name: "Kestrelwatch", kind: "Location" },
    ])
    // Names, not ids — the endpoint never touches the graph.
    expect(result.relationships).toEqual([
      { sourceName: "Aria Vane", targetName: "Kestrelwatch", relType: "LOCATED_IN" },
    ])
  })

  it("degrades an unrecognised type to Unknown rather than failing the response", async () => {
    server.use(
      postJson("/ai/extract", () =>
        Response.json({ entities: [{ name: "The Verge", type: "Artifact" }], relationships: [] }),
      ),
    )

    const result = await extractFromPassage({ passage: "The Verge endures." })

    expect(result.entities[0]?.kind).toBe("Unknown")
  })
})

describe("retrieveForQuestion", () => {
  it("sends the question alone — top_k and depth stay at the backend defaults", async () => {
    let body: Record<string, unknown> = {}
    server.use(
      postJson("/ai/retrieve", async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>
        return Response.json(wireRetrieval)
      }),
    )

    await retrieveForQuestion({ question: "who rules Kestrelwatch?" })

    expect(body).toEqual({ question: "who rules Kestrelwatch?" })
    expect(Object.keys(body)).not.toContain("top_k")
    expect(Object.keys(body)).not.toContain("depth")
  })

  it("preserves a null score, which distinguishes an expanded entity from a seed", async () => {
    server.use(postJson("/ai/retrieve", () => Response.json(wireRetrieval)))

    const result = await retrieveForQuestion({ question: "who rules Kestrelwatch?" })

    expect(result.seeds[0]?.score).toBe(0.71)
    expect(result.entities[1]).toEqual({
      id: WATCH_ID,
      kind: "Location",
      name: "Kestrelwatch",
      score: null,
    })
    expect(result.charCount).toBe(62)
    expect(result.relationships[0]).toEqual({
      source: ARIA_ID,
      target: WATCH_ID,
      relType: "LOCATED_IN",
      sentiment: undefined,
    })
  })
})

describe("askWorld", () => {
  it("always requests the retrieval trace", async () => {
    let body: unknown
    server.use(
      postJson("/ai/ask", async ({ request }) => {
        body = await request.json()
        return Response.json({ answer: "Aria does.", citations: [ARIA_ID], retrieval: null })
      }),
    )

    await askWorld({ question: "who rules Kestrelwatch?" })

    expect(body).toEqual({ question: "who rules Kestrelwatch?", debug: true })
  })

  it("parses the nested retrieval trace", async () => {
    server.use(
      postJson("/ai/ask", () =>
        Response.json({
          answer: `Aria [${ARIA_ID}] does.`,
          citations: [ARIA_ID],
          retrieval: wireRetrieval,
        }),
      ),
    )

    const result = await askWorld({ question: "who rules Kestrelwatch?" })

    expect(result.citations).toEqual([ARIA_ID])
    expect(result.retrieval?.entities).toHaveLength(2)
    expect(result.retrieval?.charCount).toBe(62)
  })

  it("normalizes an absent trace to null", async () => {
    server.use(postJson("/ai/ask", () => Response.json({ answer: "No idea.", citations: [] })))

    const result = await askWorld({ question: "what colour is the sky?" })

    expect(result.retrieval).toBeNull()
  })

  /**
   * A refusal is a *successful* answer — the system prompt asks the model to
   * decline rather than guess — so it must not surface as an error.
   */
  it("treats a refusal with no citations as a success", async () => {
    server.use(
      postJson("/ai/ask", () =>
        Response.json({
          answer: "This world does not cover that.",
          citations: [],
          retrieval: wireRetrieval,
        }),
      ),
    )

    const result = await askWorld({ question: "who won the war?" })

    expect(result.citations).toEqual([])
    expect(result.answer).toContain("does not cover")
  })
})

describe("AI error normalization", () => {
  /**
   * `RagService.ask` wraps a failed model call in `ProviderUnavailableError`.
   * The code has to survive normalization or the UI cannot tell "the model is
   * down" from a generic 500 — which is the difference between offering
   * retrieval-only and offering nothing.
   */
  it("preserves provider_unavailable from a 503 envelope", async () => {
    server.use(
      postJson("/ai/ask", () =>
        domainError(
          503,
          "provider_unavailable",
          "The language model is unreachable right now — try again shortly.",
        ),
      ),
    )

    const error = await askWorld({ question: "who rules Kestrelwatch?" }).catch((e: unknown) => e)

    expect(isApiError(error) && error.code).toBe("provider_unavailable")
    expect(isApiError(error) && error.isRetryable).toBe(true)
    expect(isApiError(error) && error.message).toContain("unreachable")
  })

  it("maps a FastAPI 422 onto the offending field", async () => {
    server.use(
      postJson("/ai/extract", () =>
        validationError([
          { loc: ["body", "passage"], msg: "String should have at least 10 characters" },
        ]),
      ),
    )

    const error = await extractFromPassage({ passage: "short" }).catch((e: unknown) => e)

    expect(isApiError(error) && error.code).toBe("validation")
    expect(isApiError(error) && error.fieldErrors?.passage).toContain("at least 10")
  })

  it("reports an unwrapped provider failure as a retryable server error", async () => {
    // `AIService.describe` does not guard its LLM call, so an unreachable
    // provider escapes as a bare 500 rather than a 503.
    server.use(
      postJson("/ai/describe", () =>
        Response.json({ detail: "Internal Server Error" }, { status: 500 }),
      ),
    )

    const error = await describeEntity({ name: "Aria Vane", traits: [] }).catch((e: unknown) => e)

    expect(isApiError(error) && error.code).toBe("server")
    expect(isApiError(error) && error.isRetryable).toBe(true)
  })
})
