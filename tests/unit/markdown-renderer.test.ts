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

  it("allows internal links", () => {
    const html = simpleMarkdownToHtml("[docs](/docs)")
    expect(html).toContain('href="/docs"')
  })

  it("opens external links in a new tab", () => {
    const html = simpleMarkdownToHtml("[site](https://example.com)")
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("adds anchor ids to headings", () => {
    const html = simpleMarkdownToHtml("## First Section\n### Sub Clause")
    expect(html).toContain('<h2 id="first-section">First Section</h2>')
    expect(html).toContain('<h3 id="sub-clause">Sub Clause</h3>')
  })

  it("preserves authored ordered-list numbers", () => {
    const html = simpleMarkdownToHtml("1. One\n2. Two\n7. Seven")
    expect(html).toContain('<li value="1">One</li>')
    expect(html).toContain('<li value="2">Two</li>')
    expect(html).toContain('<li value="7">Seven</li>')
  })

  it("preserves non-1 list starts", () => {
    const html = simpleMarkdownToHtml("4. Clause")
    expect(html).toContain('<li value="4">Clause</li>')
  })

  it("renders lower-alpha ordered lists for legal clauses", () => {
    const html = simpleMarkdownToHtml("a. First clause\nb. Second clause\nc) Third clause")
    expect(html).toContain('<ol type="a">')
    expect(html).toContain('<li value="1">First clause</li>')
    expect(html).toContain('<li value="2">Second clause</li>')
    expect(html).toContain('<li value="3">Third clause</li>')
  })

  it("applies visual indentation to indented alpha lists", () => {
    const html = simpleMarkdownToHtml("  a. Nested clause\n  b. Nested clause two")
    expect(html).toContain('<ol type="a" style="margin-left:1.25rem">')
  })
})
