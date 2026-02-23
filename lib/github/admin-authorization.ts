import { decryptSecret } from "@/lib/security/encryption"

type UserWithToken = {
  role?: string
  githubAccessTokenEncrypted?: string | null
}

type OrgMembershipResponse = {
  state?: string
  role?: string
}

/**
 * Returns true when the user is an active org admin/owner on GitHub.
 */
export async function isGitHubOrgAdmin(user: UserWithToken, orgSlug: string): Promise<boolean> {
  const encryptedToken = user.githubAccessTokenEncrypted ?? null
  if (!encryptedToken) return false

  const accessToken = decryptSecret(encryptedToken)
  if (!accessToken) return false

  const membershipRes = await fetch(`https://api.github.com/user/memberships/orgs/${orgSlug}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    cache: "no-store",
  })

  if (membershipRes.status === 404) return false
  if (!membershipRes.ok) {
    throw new Error(`Failed GitHub org membership check: ${membershipRes.status}`)
  }

  const membership = (await membershipRes.json()) as OrgMembershipResponse
  return membership.state === "active" && membership.role === "admin"
}
