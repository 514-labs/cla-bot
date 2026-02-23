type SessionUserLike = {
  id: string
  githubUsername: string
  avatarUrl: string
  name: string
  role: string
}

export type SessionUserDto = {
  id: string
  githubUsername: string
  avatarUrl: string
  name: string
  role: string
}

/**
 * Strip sensitive server-only fields from the DB user model before returning
 * user data to browser clients.
 */
export function toSessionUserDto(user: SessionUserLike | null | undefined): SessionUserDto | null {
  if (!user) return null
  return {
    id: user.id,
    githubUsername: user.githubUsername,
    avatarUrl: user.avatarUrl,
    name: user.name,
    role: user.role,
  }
}
