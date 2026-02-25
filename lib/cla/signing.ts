import { createHmac } from "node:crypto"
import {
  createAuditEvent,
  createSignature,
  getOrganizationBySlug,
  getSignatureStatus,
} from "@/lib/db/queries"

const DEFAULT_CONSENT_TEXT_VERSION = "v1"

type SignClaUser = {
  id: string
  sessionJti?: string | null
  githubId?: string | null
  githubUsername: string
  name: string
  avatarUrl: string
  email?: string | null
  emailVerified?: boolean | null
  emailSource?: string | null
}

type RequestEvidence = {
  ipAddress?: string | null
  userAgent?: string | null
}

type SignClaInput = {
  orgSlug: string
  user: SignClaUser
  repoName?: string | null
  prNumber?: number | string | null
  acceptedSha256?: string | null
  assented?: boolean
  consentTextVersion?: string | null
  requestEvidence?: RequestEvidence
}

export type SignClaResult = {
  signature: Awaited<ReturnType<typeof createSignature>>
  org: {
    id: string
    orgSlug: string
    installationId: number | null
    claSha256: string
  }
  prSyncContext: {
    repoName: string | null
    prNumber: number | null
  }
}

export async function signClaForUser(input: SignClaInput): Promise<SignClaResult> {
  const {
    orgSlug,
    user,
    repoName,
    prNumber,
    acceptedSha256,
    assented,
    consentTextVersion,
    requestEvidence,
  } = input

  if (!orgSlug) {
    throw new SignClaError("BAD_REQUEST", "orgSlug is required", 400)
  }

  if (!user?.id || !user.githubUsername) {
    throw new SignClaError("UNAUTHORIZED", "Unauthorized", 401)
  }

  const normalizedAssented = assented ?? true
  if (normalizedAssented !== true) {
    throw new SignClaError("BAD_REQUEST", "Explicit assent is required before signing", 400)
  }

  const normalizedConsentTextVersion =
    typeof consentTextVersion === "string" && consentTextVersion.trim().length > 0
      ? consentTextVersion.trim()
      : DEFAULT_CONSENT_TEXT_VERSION

  const normalizedRepoName =
    typeof repoName === "string" && repoName.trim() ? repoName.trim() : null
  const parsedPrNumber = normalizePrNumber(prNumber)
  if ((normalizedRepoName && !parsedPrNumber) || (!normalizedRepoName && parsedPrNumber)) {
    throw new SignClaError("BAD_REQUEST", "repoName and prNumber must be provided together", 400)
  }

  const org = await getOrganizationBySlug(orgSlug)
  if (!org) {
    throw new SignClaError("NOT_FOUND", "Organization not found", 404)
  }

  if (!org.isActive) {
    throw new SignClaError("FORBIDDEN", "CLA bot is not active for this organization", 403)
  }

  if (!org.claTextSha256) {
    throw new SignClaError("BAD_REQUEST", "No CLA configured for this organization", 400)
  }

  const normalizedAcceptedSha256 =
    typeof acceptedSha256 === "string" && acceptedSha256.trim().length > 0
      ? acceptedSha256
      : org.claTextSha256

  if (normalizedAcceptedSha256 !== org.claTextSha256) {
    throw new SignClaError(
      "VERSION_MISMATCH",
      "CLA version mismatch. Reload the page and review the latest agreement before signing.",
      409,
      { currentSha256: org.claTextSha256 }
    )
  }

  const status = await getSignatureStatus(orgSlug, user.id)
  if (status.signed && status.currentVersion) {
    throw new SignClaError("ALREADY_SIGNED", "Already signed current version", 409, {
      signature: status.signature,
    })
  }

  if (!user.sessionJti) {
    throw new SignClaError("UNAUTHORIZED", "Missing session context", 401)
  }

  const emailEvidence = resolveEmailEvidence(user)

  const signature = await createSignature({
    orgId: org.id,
    userId: user.id,
    claSha256: org.claTextSha256,
    acceptedSha256: normalizedAcceptedSha256,
    consentTextVersion: normalizedConsentTextVersion,
    assented: normalizedAssented,
    claText: org.claText,
    githubUserIdAtSignature: user.githubId ?? "",
    githubUsername: user.githubUsername,
    emailAtSignature: emailEvidence.email,
    emailVerifiedAtSignature: emailEvidence.verified,
    emailSource: emailEvidence.source,
    sessionJti: user.sessionJti,
    ipHash: hashIpAddress(requestEvidence?.ipAddress ?? null),
    userAgent: requestEvidence?.userAgent ?? null,
    name: user.name,
    avatarUrl: user.avatarUrl,
  })

  await createAuditEvent({
    eventType: "signature.created",
    orgId: org.id,
    userId: user.id,
    actorGithubId: user.githubId ?? null,
    actorGithubUsername: user.githubUsername,
    payload: {
      claSha256: org.claTextSha256,
      acceptedSha256: normalizedAcceptedSha256,
      consentTextVersion: normalizedConsentTextVersion,
      repoName: normalizedRepoName,
      prNumber: parsedPrNumber,
    },
  })

  return {
    signature,
    org: {
      id: org.id,
      orgSlug: org.githubOrgSlug,
      installationId: org.installationId ?? null,
      claSha256: org.claTextSha256,
    },
    prSyncContext: {
      repoName: normalizedRepoName,
      prNumber: parsedPrNumber,
    },
  }
}

export class SignClaError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.status = status
    this.details = details
  }
}

export function resolveRequestEvidenceFromHeaders(headers: Pick<Headers, "get">): RequestEvidence {
  const forwardedFor = headers.get("x-forwarded-for")
  const realIp = headers.get("x-real-ip")
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || realIp?.trim() || null

  return {
    ipAddress,
    userAgent: headers.get("user-agent"),
  }
}

export function getBaseUrlFromHeaders(headers: Pick<Headers, "get">): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  if (configured) return configured

  const host = headers.get("x-forwarded-host") ?? headers.get("host")
  const protocol = headers.get("x-forwarded-proto") ?? "https"
  if (!host) return getAppBaseUrl()

  return `${protocol}://${host}`
}

function normalizePrNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) return value
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10)
    if (Number.isInteger(parsed) && parsed > 0) return parsed
  }
  return null
}

function getAppBaseUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || "https://cla.fiveonefour.com"
}

function resolveEmailEvidence(user: {
  email?: string | null
  emailVerified?: boolean | null
  emailSource?: string | null
  githubUsername: string
}) {
  const normalizedEmail = typeof user.email === "string" ? user.email.trim() : ""
  if (normalizedEmail.length > 0) {
    return {
      email: normalizedEmail,
      verified: Boolean(user.emailVerified),
      source: user.emailSource ?? "any",
    }
  }

  return {
    email: `${user.githubUsername}@users.noreply.github.com`,
    verified: false,
    source: "none",
  }
}

function hashIpAddress(source: string | null) {
  const secret = process.env.SESSION_SECRET
  if (!secret || !source) return null
  return createHmac("sha256", secret).update(source).digest("hex")
}
