export type TestRole = "admin" | "contributor"

export const TEST_USERS = {
  admin: {
    id: "user_1",
    githubId: "1001",
    githubUsername: "orgadmin",
    email: "orgadmin@fiveonefour.com",
    emailVerified: true,
    emailSource: "primary_verified",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=OA&backgroundColor=059669",
    name: "Org Admin",
    role: "admin" as const,
  },
  contributor: {
    id: "user_2",
    githubId: "1002",
    githubUsername: "contributor1",
    email: "jane.contributor@example.com",
    emailVerified: true,
    emailSource: "primary_verified",
    avatarUrl: "https://api.dicebear.com/7.x/initials/svg?seed=C1&backgroundColor=0891b2",
    name: "Jane Contributor",
    role: "contributor" as const,
  },
} as const
