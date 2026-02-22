/**
 * Mock auth utilities.
 *
 * In production, replace with real Neon Auth + GitHub OAuth flow:
 *   - GitHub App OAuth callback sets a secure HTTP-only cookie
 *   - getSession() reads the cookie and verifies against the DB
 *   - Neon RLS policies enforce row-level access per user
 */

import { MOCK_ADMIN_USER, MOCK_CONTRIBUTOR_USER, type User } from "./mock-data"

// Simulated "current user" - toggle between admin and contributor
// In production, this comes from the session cookie
let currentRole: "admin" | "contributor" = "admin"

export function getSession(): User | null {
  if (currentRole === "admin") return MOCK_ADMIN_USER
  return MOCK_CONTRIBUTOR_USER
}

export function setMockRole(role: "admin" | "contributor") {
  currentRole = role
}

export function getMockRole(): "admin" | "contributor" {
  return currentRole
}
