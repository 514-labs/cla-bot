import { MOCK_ADMIN_USER, MOCK_CONTRIBUTOR_USER, type User } from "./mock-data"

let currentRole: "admin" | "contributor" = "admin"

export function getSessionUser(): User {
  return currentRole === "admin" ? { ...MOCK_ADMIN_USER } : { ...MOCK_CONTRIBUTOR_USER }
}

export function setCurrentRole(role: "admin" | "contributor") {
  currentRole = role
}

export function getCurrentRole(): "admin" | "contributor" {
  return currentRole
}
