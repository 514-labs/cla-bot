"use client"

import { cn } from "@/lib/utils"
import { slugifyHeading } from "@/lib/markdown"

/**
 * A simple markdown-to-HTML renderer for CLA display.
 * HTML is escaped before markdown transforms to avoid script injection.
 */
export function MarkdownRenderer({ content, className }: { content: string; className?: string }) {
  const html = simpleMarkdownToHtml(content)

  return (
    <div
      className={cn("cla-markdown max-w-none", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function simpleMarkdownToHtml(md: string): string {
  const escaped = escapeHtml(md)

  const html = escaped
    // Headers
    .replace(/^### (.+)$/gm, (_match, heading: string) => {
      const id = slugifyHeading(heading)
      return `<h3 id="${id}">${heading}</h3>`
    })
    .replace(/^## (.+)$/gm, (_match, heading: string) => {
      const id = slugifyHeading(heading)
      return `<h2 id="${id}">${heading}</h2>`
    })
    .replace(/^# (.+)$/gm, (_match, heading: string) => {
      const id = slugifyHeading(heading)
      return `<h1 id="${id}">${heading}</h1>`
    })
    // Images: ![alt](url)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, altText, rawUrl) => {
      const src = sanitizeImageUrl(rawUrl)
      const safeAlt = altText.replaceAll('"', "&quot;")
      return `<img src="${src}" alt="${safeAlt}" loading="lazy" decoding="async" />`
    })
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, rawUrl) => {
      const { href, attrs } = sanitizeLinkUrl(rawUrl)
      return `<a href="${href}"${attrs}>$1</a>`.replace("$1", text)
    })
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")

  // Process lists and blockquotes
  const lines = html.split("\n")
  const result: string[] = []
  type ListKind = "ol" | "ul" | "ol-alpha-lower" | "ol-alpha-upper"
  type ListState = { kind: ListKind; indent: number }
  let listState: ListState | null = null
  let inBlockquote = false

  const closeList = (state: ListState | null) => {
    if (!state) return null
    result.push(state.kind === "ul" ? "</ul>" : "</ol>")
    return null
  }

  const openList = (kind: ListKind, indent: number): ListState => {
    if (kind === "ul") {
      result.push(`<ul${listIndentStyle(indent)}>`)
      return { kind, indent }
    }

    const typeAttr =
      kind === "ol-alpha-lower" ? ' type="a"' : kind === "ol-alpha-upper" ? ' type="A"' : ""
    result.push(`<ol${typeAttr}${listIndentStyle(indent)}>`)
    return { kind, indent }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nextLine = lines[i + 1]
    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
    const alphaMatch = line.match(/^(\s*)([a-zA-Z])[.)]\s+(.+)$/)
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/)
    const bqMatch = line.match(/^>\s?(.*)$/)
    const startsTable = isTableRow(line) && isTableSeparator(nextLine)

    if (startsTable) {
      listState = closeList(listState)
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }

      const headers = splitTableRow(line)
      result.push("<table>")
      result.push("<thead>")
      result.push("<tr>")
      for (const header of headers) {
        result.push(`<th>${header}</th>`)
      }
      result.push("</tr>")
      result.push("</thead>")
      result.push("<tbody>")

      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        const cells = splitTableRow(lines[i])
        result.push("<tr>")
        for (const cell of cells) {
          result.push(`<td>${cell}</td>`)
        }
        result.push("</tr>")
        i += 1
      }
      result.push("</tbody>")
      result.push("</table>")

      i -= 1
      continue
    }

    if (olMatch) {
      const indent = getListIndentLevel(olMatch[1])
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!listState || listState.kind !== "ol" || listState.indent !== indent) {
        listState = closeList(listState)
        listState = openList("ol", indent)
      }
      result.push(`<li value="${olMatch[2]}">${olMatch[3]}</li>`)
    } else if (alphaMatch) {
      const indent = getListIndentLevel(alphaMatch[1])
      const marker = alphaMatch[2]
      const markerValue = marker.toLowerCase().charCodeAt(0) - 96
      const listKind = marker === marker.toUpperCase() ? "ol-alpha-upper" : "ol-alpha-lower"

      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!listState || listState.kind !== listKind || listState.indent !== indent) {
        listState = closeList(listState)
        listState = openList(listKind, indent)
      }
      result.push(`<li value="${markerValue}">${alphaMatch[3]}</li>`)
    } else if (ulMatch) {
      const indent = getListIndentLevel(ulMatch[1])
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!listState || listState.kind !== "ul" || listState.indent !== indent) {
        listState = closeList(listState)
        listState = openList("ul", indent)
      }
      result.push(`<li>${ulMatch[2]}</li>`)
    } else if (bqMatch) {
      listState = closeList(listState)
      if (!inBlockquote) {
        result.push("<blockquote>")
        inBlockquote = true
      }
      if (bqMatch[1].trim()) {
        result.push(`<p>${bqMatch[1]}</p>`)
      }
    } else {
      listState = closeList(listState)
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (
        line.trim() &&
        !line.startsWith("<h") &&
        !line.startsWith("<ol") &&
        !line.startsWith("<ul") &&
        !line.startsWith("<li") &&
        !line.startsWith("</") &&
        !line.startsWith("<hr")
      ) {
        result.push(`<p>${line}</p>`)
      } else if (line.trim()) {
        result.push(line)
      }
    }
  }

  listState = closeList(listState)
  if (inBlockquote) result.push("</blockquote>")

  return result.join("\n")
}

function getListIndentLevel(rawIndent: string) {
  const normalized = rawIndent.replaceAll("\t", "  ")
  return Math.floor(normalized.length / 2)
}

function listIndentStyle(indentLevel: number) {
  if (indentLevel <= 0) return ""
  const marginLeft = (indentLevel * 1.25).toFixed(2).replace(/\.00$/, "")
  return ` style="margin-left:${marginLeft}rem"`
}

function escapeHtml(input: string) {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function sanitizeLinkUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  const escapedHref = trimmed.replaceAll('"', "&quot;")

  if (trimmed.startsWith("//")) {
    return {
      href: escapedHref,
      attrs: ' target="_blank" rel="noopener noreferrer"',
    }
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return {
      href: escapedHref,
      attrs: ' target="_blank" rel="noopener noreferrer"',
    }
  }

  if (
    (trimmed.startsWith("/") && !trimmed.startsWith("//")) ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    trimmed.startsWith("#")
  ) {
    return { href: escapedHref, attrs: "" }
  }

  return { href: "#", attrs: "" }
}

function sanitizeImageUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    (trimmed.startsWith("/") && !trimmed.startsWith("//")) ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed.replaceAll('"', "&quot;")
  }
  return ""
}

function isTableRow(line: string | undefined) {
  if (!line) return false
  const trimmed = line.trim()
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return false
  return trimmed.includes("|")
}

function isTableSeparator(line: string | undefined) {
  if (!line) return false
  const trimmed = line.trim()
  return /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(trimmed)
}

function splitTableRow(line: string) {
  return line
    .trim()
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim())
}
