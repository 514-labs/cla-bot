import { NextRequest, NextResponse } from "next/server"
import { runAllTests, getTestCount } from "@/lib/e2e-tests"

export const maxDuration = 30

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const { origin } = new URL(request.url)
  const results = await runAllTests(origin)

  const passed = results.filter((r) => r.passed).length
  const failed = results.filter((r) => !r.passed).length
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

  return NextResponse.json({
    summary: {
      total: getTestCount(),
      passed,
      failed,
      duration: totalDuration,
    },
    results,
  })
}
