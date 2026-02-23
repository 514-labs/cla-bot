import { describe, expect, it } from "vitest"
import { simpleMarkdownToHtml } from "@/components/markdown-renderer"

describe("simpleMarkdownToHtml", () => {
  it("escapes raw HTML tags", () => {
    const html = simpleMarkdownToHtml("# Title\n\n<script>alert('xss')</script>")
    expect(html).toContain("&lt;script&gt;alert")
    expect(html).not.toContain("<script>")
  })

  it("sanitizes javascript links", () => {
    const html = simpleMarkdownToHtml("[click](javascript:alert(1))")
    expect(html).toContain('href="#"')
  })
})
