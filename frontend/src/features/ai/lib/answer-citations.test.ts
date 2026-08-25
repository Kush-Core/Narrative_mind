import { describe, expect, it } from "vitest"

import { parseAnswer, resolveCitations } from "@/features/ai/lib/answer-citations"
import type { RetrievedEntity } from "@/features/ai/model/ai.schema"

const ARIA: RetrievedEntity = {
  id: "3f2a1b4c-5d6e-4f70-8192-a3b4c5d6e7f8",
  kind: "Character",
  name: "Aria Vane",
  score: 0.71,
}

const KESTRELWATCH: RetrievedEntity = {
  id: "9c810f23-4a5b-4c6d-9e0f-1a2b3c4d5e6f",
  kind: "Location",
  name: "Kestrelwatch",
  score: null,
}

const UNRETRIEVED_ID = "00000000-1111-4222-8333-444444444444"

const ENTITIES = [ARIA, KESTRELWATCH]

describe("parseAnswer", () => {
  it("returns a single text segment when there are no brackets", () => {
    expect(parseAnswer("Nothing here cites anything.", ENTITIES)).toEqual([
      { kind: "text", text: "Nothing here cites anything." },
    ])
  })

  it("replaces a retrieved id with a citation segment", () => {
    const segments = parseAnswer(`Aria [${ARIA.id}] rules there.`, ENTITIES)

    expect(segments).toEqual([
      { kind: "text", text: "Aria " },
      { kind: "citation", entity: ARIA },
      { kind: "text", text: " rules there." },
    ])
  })

  it("expands a bracket holding several ids into one citation each", () => {
    const segments = parseAnswer(`Both [${ARIA.id}, ${KESTRELWATCH.id}] matter.`, ENTITIES)

    expect(segments).toEqual([
      { kind: "text", text: "Both " },
      { kind: "citation", entity: ARIA },
      { kind: "citation", entity: KESTRELWATCH },
      { kind: "text", text: " matter." },
    ])
  })

  /**
   * The backend validates `citations`, but the *inline* markers are raw model
   * output. A hallucinated id must never be presented as a source.
   */
  it("drops a UUID-shaped id that was never retrieved", () => {
    const segments = parseAnswer(`The keep [${UNRETRIEVED_ID}] stands.`, ENTITIES)

    expect(segments).toEqual([{ kind: "text", text: "The keep stands." }])
  })

  it("takes the leading space with a dropped marker only when the prose needs it", () => {
    expect(parseAnswer(`It fell [${UNRETRIEVED_ID}].`, ENTITIES)).toEqual([
      { kind: "text", text: "It fell." },
    ])
  })

  it("leaves brackets that are ordinary prose untouched", () => {
    const answer = "The record says [sic] the gate held."

    expect(parseAnswer(answer, ENTITIES)).toEqual([{ kind: "text", text: answer }])
  })

  it("leaves a bracket alone when only some of its tokens are ids", () => {
    const answer = `A mix [${ARIA.id}, not-an-id] here.`

    expect(parseAnswer(answer, ENTITIES)).toEqual([{ kind: "text", text: answer }])
  })

  it("handles adjacent citations with no text between them", () => {
    const segments = parseAnswer(`[${ARIA.id}][${KESTRELWATCH.id}]`, ENTITIES)

    expect(segments).toEqual([
      { kind: "citation", entity: ARIA },
      { kind: "citation", entity: KESTRELWATCH },
    ])
  })

  it("treats every id as unretrieved when nothing was retrieved", () => {
    expect(parseAnswer(`Nothing [${ARIA.id}] to go on.`, [])).toEqual([
      { kind: "text", text: "Nothing to go on." },
    ])
  })

  it("returns no segments for an empty answer", () => {
    expect(parseAnswer("", ENTITIES)).toEqual([])
  })
})

describe("resolveCitations", () => {
  it("resolves ids to entities in the order given", () => {
    expect(resolveCitations([KESTRELWATCH.id, ARIA.id], ENTITIES)).toEqual([KESTRELWATCH, ARIA])
  })

  it("drops ids with no retrieved entity behind them", () => {
    expect(resolveCitations([ARIA.id, UNRETRIEVED_ID], ENTITIES)).toEqual([ARIA])
  })

  it("deduplicates repeated ids", () => {
    expect(resolveCitations([ARIA.id, ARIA.id], ENTITIES)).toEqual([ARIA])
  })

  it("is empty for a refusal, which cites nothing", () => {
    expect(resolveCitations([], ENTITIES)).toEqual([])
  })
})
