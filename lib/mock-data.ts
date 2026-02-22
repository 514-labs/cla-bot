export type User = {
  id: string
  githubUsername: string
  avatarUrl: string
  name: string
  role: "admin" | "contributor"
}

export type Organization = {
  id: string
  githubOrgSlug: string
  name: string
  avatarUrl: string
  installedAt: string
  adminUserId: string
  isActive: boolean
  claText: string
  claTextSha256: string | null
}

export type ClaArchive = {
  id: string
  orgId: string
  sha256: string
  claText: string
  createdAt: string
}

export type ClaSignature = {
  id: string
  orgId: string
  userId: string
  claSha256: string
  signedAt: string
  githubUsername: string
  name: string
  avatarUrl: string
}

export type CheckRunStatus = "pending" | "success" | "failure"

export type CheckRun = {
  id: string
  orgId: string
  repoName: string
  prNumber: number
  prAuthor: string
  headSha: string
  status: CheckRunStatus
  createdAt: string
  updatedAt: string
}

export type BotComment = {
  id: string
  orgId: string
  repoName: string
  prNumber: number
  prAuthor: string
  commentMarkdown: string
  createdAt: string
}

// Org membership — members of the org do NOT need to sign the CLA
export type OrgMember = {
  orgId: string
  githubUsername: string
}

// Default CLA template
export const DEFAULT_CLA_MARKDOWN = `# Contributor License Agreement

Thank you for your interest in contributing to our project. In order to clarify the intellectual property license granted with contributions from any person or entity, we must have a Contributor License Agreement ("CLA") on file that has been signed by each contributor, indicating agreement to the license terms below.

## Terms

1. **Definitions.** "You" (or "Your") shall mean the copyright owner or legal entity authorized by the copyright owner that is making this Agreement. "Contribution" shall mean any original work of authorship, including any modifications or additions to an existing work, that is intentionally submitted by You for inclusion in the project.

2. **Grant of Copyright License.** Subject to the terms and conditions of this Agreement, You hereby grant a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable copyright license to reproduce, prepare derivative works of, publicly display, publicly perform, sublicense, and distribute Your Contributions and such derivative works.

3. **Grant of Patent License.** Subject to the terms and conditions of this Agreement, You hereby grant a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license to make, have made, use, offer to sell, sell, import, and otherwise transfer the Work.

4. **You represent that you are legally entitled to grant the above license.** If your employer(s) has rights to intellectual property that you create, you represent that you have received permission to make Contributions on behalf of that employer.

5. **You represent that each of Your Contributions is Your original creation.**

6. **You are not expected to provide support for Your Contributions**, except to the extent You desire to provide support. You may provide support for free, for a fee, or not at all.

By signing below, you accept and agree to the terms of this Contributor License Agreement for all present and future contributions.
`

// Mock admin user
export const MOCK_ADMIN_USER: User = {
  id: "user_1",
  githubUsername: "orgadmin",
  avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=OA&backgroundColor=059669",
  name: "Org Admin",
  role: "admin",
}

// Mock contributor user
export const MOCK_CONTRIBUTOR_USER: User = {
  id: "user_2",
  githubUsername: "contributor1",
  avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
  name: "Jane Contributor",
  role: "contributor",
}

// Mock organizations (claText + claTextSha256 will be set by seed)
export const MOCK_ORGANIZATIONS: Organization[] = [
  {
    id: "org_1",
    githubOrgSlug: "fiveonefour",
    name: "Fiveonefour",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=514&backgroundColor=059669",
    installedAt: "2025-08-15T10:00:00Z",
    adminUserId: "user_1",
    isActive: true,
    claText: DEFAULT_CLA_MARKDOWN,
    claTextSha256: null, // computed at seed time
  },
  {
    id: "org_2",
    githubOrgSlug: "moose-stack",
    name: "MooseStack",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=MS&backgroundColor=059669",
    installedAt: "2025-09-01T14:30:00Z",
    adminUserId: "user_1",
    isActive: true,
    claText: DEFAULT_CLA_MARKDOWN,
    claTextSha256: null, // computed at seed time
  },
]

// Mock org members (these users bypass CLA checks)
export const MOCK_ORG_MEMBERS: OrgMember[] = [
  { orgId: "org_1", githubUsername: "orgadmin" },
  { orgId: "org_2", githubUsername: "orgadmin" },
]

// Mock signatures (linked by sha256 -- placeholder, actual hash computed at seed time)
export const MOCK_SIGNATURES: ClaSignature[] = [
  {
    id: "sig_1",
    orgId: "org_1",
    userId: "user_2",
    claSha256: "placeholder",
    signedAt: "2025-10-05T09:15:00Z",
    githubUsername: "contributor1",
    name: "Jane Contributor",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
  },
  {
    id: "sig_2",
    orgId: "org_1",
    userId: "user_3",
    claSha256: "placeholder",
    signedAt: "2025-10-12T16:45:00Z",
    githubUsername: "dev-sarah",
    name: "Sarah Chen",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=SC&backgroundColor=7c3aed",
  },
  {
    id: "sig_3",
    orgId: "org_1",
    userId: "user_4",
    claSha256: "placeholder",
    signedAt: "2025-11-01T11:30:00Z",
    githubUsername: "alex-codes",
    name: "Alex Johnson",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=AJ&backgroundColor=dc2626",
  },
  {
    id: "sig_4",
    orgId: "org_2",
    userId: "user_2",
    claSha256: "placeholder",
    signedAt: "2025-11-10T08:00:00Z",
    githubUsername: "contributor1",
    name: "Jane Contributor",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
  },
]
