/**
 * The Graph resource against a faithful stand-in for the backend.
 *
 * Validation matters more here than for the entity resources: both `/graph`
 * handlers are declared `-> dict` in FastAPI, so there is no response model and
 * no generated schema. The Zod layer is the only thing between a changed Cypher
 * projection and a crash inside the renderer.
 */

import { HttpResponse } from "msw"
import { describe, expect, it } from "vitest"

import { fetchCharacterNetwork } from "@/features/graph/api/graph.api"
import { ApiError } from "@/shared/api/api-error"
import { domainError, getJson, server } from "@/test/msw/server"

const wireNetwork = {
  center: { id: "c-1", name: "Aria Vane" },
  neighbors: [
    { id: "c-2", name: "Roderic", labels: ["Character"] },
    { id: "l-1", name: "Dunhollow", labels: ["Location"] },
  ],
}

describe("fetchCharacterNetwork", () => {
  it("requests the character's network with the depth query param", async () => {
    let url = ""
    server.use(
      getJson("/graph/characters/c-1/network", ({ request }) => {
        url = request.url
        return HttpResponse.json(wireNetwork)
      }),
    )

    await fetchCharacterNetwork("c-1", 2)

    expect(new URL(url).pathname).toBe("/graph/characters/c-1/network")
    expect(new URL(url).searchParams.get("depth")).toBe("2")
  })

  it("encodes an id that would otherwise break the path", async () => {
    server.use(getJson("/graph/characters/a%2Fb/network", () => HttpResponse.json(wireNetwork)))

    await expect(fetchCharacterNetwork("a/b", 1)).resolves.toBeDefined()
  })

  it("returns the validated network", async () => {
    server.use(getJson("/graph/characters/c-1/network", () => HttpResponse.json(wireNetwork)))

    const network = await fetchCharacterNetwork("c-1", 1)

    expect(network.center).toEqual({ id: "c-1", name: "Aria Vane" })
    expect(network.neighbors).toHaveLength(2)
    expect(network.neighbors[0]).toEqual({ id: "c-2", name: "Roderic", labels: ["Character"] })
  })

  it("tolerates a null neighbours list — an isolated character", async () => {
    server.use(
      getJson("/graph/characters/c-1/network", () =>
        HttpResponse.json({ center: wireNetwork.center, neighbors: null }),
      ),
    )

    await expect(fetchCharacterNetwork("c-1", 1)).resolves.toMatchObject({ neighbors: [] })
  })

  it("defaults a neighbour's missing name and labels rather than failing", async () => {
    server.use(
      getJson("/graph/characters/c-1/network", () =>
        HttpResponse.json({ center: wireNetwork.center, neighbors: [{ id: "x-1" }] }),
      ),
    )

    const network = await fetchCharacterNetwork("c-1", 1)

    expect(network.neighbors[0]).toEqual({ id: "x-1", name: "Untitled", labels: [] })
  })

  it("surfaces an unknown character as a not_found ApiError", async () => {
    server.use(
      getJson("/graph/characters/nope/network", () =>
        domainError(404, "not_found", "Character with id nope not found"),
      ),
    )

    const error = (await fetchCharacterNetwork("nope", 1).catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.isNotFound).toBe(true)
  })

  it("turns a contract change into one parse error, not a renderer crash", async () => {
    // If the Cypher projection ever drops `center`, this must fail loudly at the
    // boundary rather than reaching the engine as undefined.
    server.use(getJson("/graph/characters/c-1/network", () => HttpResponse.json({ neighbors: [] })))

    const error = (await fetchCharacterNetwork("c-1", 1).catch((c: unknown) => c)) as ApiError

    expect(error).toBeInstanceOf(ApiError)
    expect(error.code).toBe("parse")
  })
})
