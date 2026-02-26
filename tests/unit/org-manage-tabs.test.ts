import { describe, expect, it } from "vitest"
import {
  ORG_MANAGE_TABS,
  ORG_MANAGE_DEFAULT_TAB,
  parseOrgManageTab,
} from "@/lib/admin/org-manage-tabs"

describe("ORG_MANAGE_TABS", () => {
  it("contains expected tabs", () => {
    expect(ORG_MANAGE_TABS).toEqual(["cla", "signers", "archives", "bypass"])
  })
})

describe("ORG_MANAGE_DEFAULT_TAB", () => {
  it("defaults to cla", () => {
    expect(ORG_MANAGE_DEFAULT_TAB).toBe("cla")
  })
})

describe("parseOrgManageTab", () => {
  it("parses valid tab names", () => {
    expect(parseOrgManageTab("cla")).toBe("cla")
    expect(parseOrgManageTab("signers")).toBe("signers")
    expect(parseOrgManageTab("archives")).toBe("archives")
    expect(parseOrgManageTab("bypass")).toBe("bypass")
  })

  it("returns null for invalid tab", () => {
    expect(parseOrgManageTab("invalid")).toBeNull()
  })

  it("returns null for null/undefined", () => {
    expect(parseOrgManageTab(null)).toBeNull()
    expect(parseOrgManageTab(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(parseOrgManageTab("")).toBeNull()
  })
})
