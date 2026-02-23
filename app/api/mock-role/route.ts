import { NextRequest, NextResponse } from "next/server"
import { setCurrentRole, getCurrentRole, getSessionUser } from "@/lib/mock-db"

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  return NextResponse.json({ role: getCurrentRole(), user: getSessionUser() })
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const body = await request.json()
  const role = body.role as "admin" | "contributor"
  if (role !== "admin" && role !== "contributor") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }
  setCurrentRole(role)
  return NextResponse.json({ role, user: getSessionUser() })
}
