/**
 * The shared write-mapping helpers.
 *
 * These now sit between every entity's form and the backend, so their two
 * asymmetries — blank-to-null on create, blank-preserved on update, and the
 * writable-field allow-list — are pinned here rather than re-verified per
 * entity.
 */

import { describe, expect, it } from "vitest"

import { emptyToNull, pickDefined } from "@/shared/schemas/wire"

describe("emptyToNull", () => {
  it("converts a blank or whitespace-only value to null", () => {
    expect(emptyToNull("")).toBeNull()
    expect(emptyToNull("   ")).toBeNull()
  })

  it("passes a real value through untouched, including its surrounding space", () => {
    // Trimming is the schema's job (`str_strip_whitespace` is mirrored there);
    // this helper only decides null vs not-null.
    expect(emptyToNull("Dunhollow")).toBe("Dunhollow")
    expect(emptyToNull(" Dunhollow ")).toBe(" Dunhollow ")
  })
})

describe("pickDefined", () => {
  /** Stands in for a form type; the helper is always called with one in practice. */
  type TestForm = { name: string; region: string; description: string }

  const fields = ["name", "region", "description"] as const

  it("copies only the fields present in the patch", () => {
    expect(pickDefined<TestForm>({ name: "Dunhollow" }, fields)).toEqual({ name: "Dunhollow" })
  })

  it("omits undefined fields rather than sending them", () => {
    expect(pickDefined<TestForm>({ name: "Dunhollow", region: undefined }, fields)).toEqual({
      name: "Dunhollow",
    })
  })

  it("preserves an empty string, which is how a field is cleared", () => {
    // `exclude_none=True` server-side means null would be dropped and the old
    // value would survive — so "" must reach the wire intact.
    expect(pickDefined<TestForm>({ region: "" }, fields)).toEqual({ region: "" })
  })

  it("drops fields outside the writable allow-list", () => {
    // The allow-list is what keeps computed and server-owned fields out of a
    // write body structurally — this is the Character `display_name` case.
    type Characterish = { name: string; displayName: string; id: string }
    const patch: Partial<Characterish> = {
      name: "Aria",
      displayName: "Aria (The Ashen)",
      id: "c-1",
    }

    expect(pickDefined<Characterish>(patch, ["name"])).toEqual({ name: "Aria" })
  })

  it("returns an empty object when nothing is writable, leaving the caller to skip", () => {
    // `diffForUpdate` is what decides whether a request happens at all; the
    // resource layer refuses an empty body rather than sending a 422.
    expect(pickDefined<TestForm>({}, fields)).toEqual({})
  })
})
