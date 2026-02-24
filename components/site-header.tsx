import { getSessionUser } from "@/lib/auth"
import { toSessionUserDto } from "@/lib/session-user"
import { SiteHeaderClient } from "@/components/site-header-client"

export async function SiteHeader() {
  const user = toSessionUserDto(await getSessionUser())
  return <SiteHeaderClient user={user} />
}
