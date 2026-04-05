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

  it("treats protocol-relative links as external", () => {
    const html = simpleMarkdownToHtml("[offsite](//evil.com)")
    expect(html).toContain('href="//evil.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })

  it("renders markdown images", () => {
    const html = simpleMarkdownToHtml(
      "![Contributor signing screenshot](/docs/screenshots/foo.svg)"
    )
    expect(html).toContain('<img src="/docs/screenshots/foo.svg"')
    expect(html).toContain('alt="Contributor signing screenshot"')
  })

  it("sanitizes unsafe image urls", () => {
    const html = simpleMarkdownToHtml("![x](javascript:alert(1))")
    expect(html).toContain('<img src="" alt="x"')
  })

  it("does not apply inline markdown transforms inside image alt text", () => {
    const html = simpleMarkdownToHtml("![my **bold** alt](/docs/img.svg)")
    expect(html).toContain('alt="my **bold** alt"')
    expect(html).not.toContain('<img src="/docs/img.svg" alt="my <strong>bold</strong> alt"')
  })

  it("adds anchor ids to headings", () => {
    const html = simpleMarkdownToHtml("## First Section\n### Sub Clause")
    expect(html).toContain('<h2 id="first-section">First Section</h2>')
    expect(html).toContain('<h3 id="sub-clause">Sub Clause</h3>')
  })

  it("renders markdown pipe tables", () => {
    const html = simpleMarkdownToHtml(
      "| Symptom | Action |\n| --- | --- |\n| Failing check | Re-sign CLA |\n| Missing auth | Sign in |"
    )
    expect(html).toContain("<table>")
    expect(html).toContain("<thead>")
    expect(html).toContain("<tbody>")
    expect(html).toContain("<th>Symptom</th>")
    expect(html).toContain("<td>Re-sign CLA</td>")
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
