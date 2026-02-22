import { NextRequest, NextResponse } from "next/server"
import { setCurrentRole, getCurrentRole, getSessionUser } from "@/lib/db/queries"

export async function GET() {
  return NextResponse.json({ role: getCurrentRole(), user: getSessionUser() })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const role = body.role as "admin" | "contributor"
  if (role !== "admin" && role !== "contributor") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  setCurrentRole(role)
  return NextResponse.json({ role, user: getSessionUser() })
}
