import { notFound } from "next/navigation"
import { showTests } from "@/flags"
import TestContent from "./test-content"

export default async function TestPage() {
  const enabled = await showTests()
  if (!enabled) notFound()
  return <TestContent />
}
