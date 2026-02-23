import { NextResponse } from "next/server"
import { showPrPreview, showTests } from "@/flags"

export async function GET() {
  const [prPreview, tests] = await Promise.all([showPrPreview(), showTests()])

  return NextResponse.json({
    showPrPreview: prPreview,
    showTests: tests,
  })
}
