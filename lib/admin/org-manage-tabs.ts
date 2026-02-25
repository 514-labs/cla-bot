export const ORG_MANAGE_TABS = ["cla", "signers", "archives", "bypass"] as const

export type OrgManageTab = (typeof ORG_MANAGE_TABS)[number]

export const ORG_MANAGE_DEFAULT_TAB: OrgManageTab = "cla"

export function parseOrgManageTab(value: string | null | undefined): OrgManageTab | null {
  if (!value) return null
  if (value === "cla") return "cla"
  if (value === "signers") return "signers"
  if (value === "archives") return "archives"
  if (value === "bypass") return "bypass"
  return null
}
