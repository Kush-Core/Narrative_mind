/**
 * Test setup — starts the MSW server for the whole suite.
 *
 * Mirrors the backend's own stubbing ethos (`_FakeLLM`/`_StubLLM` in the Python
 * tests): the infrastructure is exercised against a *faithful* stand-in for the
 * backend, so the network spine can be tested without Neo4j or a running API.
 *
 * `onUnhandledRequest: "error"` is deliberate — a request the mocks do not
 * describe is a test that is lying about what it exercises.
 */

import { afterAll, afterEach, beforeAll } from "vitest"

import { server } from "@/test/msw/server"

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" })
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})
