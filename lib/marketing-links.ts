const FIVEONEFOUR_BASE_URL = "https://fiveonefour.com"
const DEFAULT_SOURCE = "cla_bot"
const DEFAULT_CAMPAIGN = "fiveonefour_referral"

export function buildFiveonefourUrl({
  medium,
  content,
  campaign = DEFAULT_CAMPAIGN,
}: {
  medium: string
  content?: string
  campaign?: string
}) {
  const url = new URL(FIVEONEFOUR_BASE_URL)
  url.searchParams.set("utm_source", DEFAULT_SOURCE)
  url.searchParams.set("utm_medium", medium)
  url.searchParams.set("utm_campaign", campaign)
  if (content) {
    url.searchParams.set("utm_content", content)
  }
  return url.toString()
}
