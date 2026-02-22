import { notFound } from "next/navigation"
import { showPrPreview } from "@/flags"
import PrPreviewContent from "./pr-preview-content"

export default async function PrPreviewPage() {
  const enabled = await showPrPreview()
  if (!enabled) notFound()
  return <PrPreviewContent />
}
