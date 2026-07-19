/**
 * The relationship write against a faithful stand-in for the backend.
 *
 * Two things are worth pinning: that the source travels in the *path* rather
 * than the body (it is a sub-resource of the character), and that the two error
 * shapes this endpoint can produce — a domain 404 for a missing endpoint entity,
 * a domain 422 for an unsupported type — arrive as classified `ApiError`s the
 * dialog can render inline.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { ApiError } from "@/shared/api/api-error"
import {
  type RelationshipForm,
  RelationshipFormSchema,
  toRelationshipBody,
} from "@/shared/relationships/relationship.schema"
import { createRelationship } from "@/shared/relationships/relationships.api"
import { domainError, postJson, server } from "@/test/msw/server"

const form: RelationshipForm = {
  sourceId: "c-1",
  relType: "MEMBER_OF",
  targetId: "f-1",
}

function created(overrides: Record<string, unknown> = {}) {
  return HttpResponse.json(
    { source_id: "c-1", target_id: "f-1", rel_type: "MEMBER_OF", sentiment: null, ...overrides },
    { status: 201 },
  )
}

describe("createRelationship", () => {
  it("posts to the character's relationships sub-resource", async () => {
    let url = ""
    server.use(
      postJson("/characters/c-1/relationships", ({ request }) => {
        url = request.url
        return created()
      }),
    )

    await createRelationship(form)

    expect(new URL(url).pathname).toBe("/characters/c-1/relationships")
  })

  it("sends the type and target in the body, and not the source", async () => {
    let body: unknown
    server.use(
      postJson("/characters/c-1/relationships", async ({ request }) => {
        body = await request.json()
        return created()
      }),
    )

    await createRelationship(form)

    // `source_id` addresses the endpoint; repeating it in the body would be a
    // second, unvalidated place for the two to disagree.
    expect(body).toEqual({ rel_type: "MEMBER_OF", target_id: "f-1" })
  })

  it("encodes an id that would otherwise break the path", async () => {
    server.use(postJson("/characters/a%2Fb/relationships", () => created()))

    await expect(createRelationship({ ...form, sourceId: "a/b" })).resolves.toBeDefined()
  })

  it("returns the created edge in domain casing", async () => {
    server.use(
      postJson("/characters/c-1/relationships", () =>
        created({ rel_type: "KNOWS", sentiment: "wary" }),
      ),
    )

    await expect(createRelationship(form)).resolves.toEqual({
      sourceId: "c-1",
      targetId: "f-1",
      relType: "KNOWS",
      sentiment: "wary",
    })
  })

  it("normalises a null sentiment to undefined", async () => {
    server.use(postJson("/characters/c-1/relationships", () => created({ sentiment: null })))

    await expect(createRelationship(form)).resolves.toMatchObject({ sentiment: undefined })
  })

  it("surfaces a missing target as a not_found ApiError", async () => {
    server.use(
      postJson("/characters/c-1/relationships", () =>
        domainError(404, "not_found", "Target with id f-1 not found"),
      ),
    )

    const error = (await createRelationship(form).catch((cause: unknown) => cause)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
  })

  it("surfaces an unsupported relationship type as a domain validation error", async () => {
    server.use(
      postJson("/characters/c-1/relationships", () =>
        domainError(422, "domain_validation", "Unsupported relationship type: RULES"),
      ),
    )

    const error = (await createRelationship(form).catch((cause: unknown) => cause)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe("domain_validation")
  })
})

describe("toRelationshipBody", () => {
  it("omits sentiment when it is absent or blank", () => {
    expect(toRelationshipBody(form)).not.toHaveProperty("sentiment")
    expect(toRelationshipBody({ ...form, sentiment: "   " })).not.toHaveProperty("sentiment")
  })

  it("trims a sentiment that has content", () => {
    expect(toRelationshipBody({ ...form, sentiment: "  loyal " })).toMatchObject({
      sentiment: "loyal",
    })
  })
})

describe("RelationshipFormSchema", () => {
  it("requires both ends", () => {
    expect(RelationshipFormSchema.safeParse({ ...form, sourceId: "" }).success).toBe(false)
    expect(RelationshipFormSchema.safeParse({ ...form, targetId: "" }).success).toBe(false)
  })

  it("rejects a relationship type the backend would not accept", () => {
    expect(RelationshipFormSchema.safeParse({ ...form, relType: "RULES" }).success).toBe(false)
  })

  it("accepts a complete relationship", () => {
    expect(RelationshipFormSchema.safeParse(form).success).toBe(true)
  })
})
