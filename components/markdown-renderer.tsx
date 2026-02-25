"use client"

import { cn } from "@/lib/utils"

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
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Inline code
    .replace(/`(.+?)`/g, "<code>$1</code>")
    // Links: [text](url)
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, rawUrl) => {
      const safeUrl = sanitizeLinkUrl(rawUrl)
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">$1</a>`.replace(
        "$1",
        text
      )
    })
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")

  // Process lists and blockquotes
  const lines = html.split("\n")
  const result: string[] = []
  let listState: {
    kind: "ol" | "ul" | "ol-alpha-lower" | "ol-alpha-upper"
    indent: number
  } | null = null
  let inBlockquote = false

  const closeList = () => {
    if (!listState) return
    result.push(listState.kind === "ul" ? "</ul>" : "</ol>")
    listState = null
  }

  const openList = (kind: "ol" | "ul" | "ol-alpha-lower" | "ol-alpha-upper", indent: number) => {
    if (kind === "ul") {
      result.push(`<ul${listIndentStyle(indent)}>`)
      listState = { kind, indent }
      return
    }

    const typeAttr =
      kind === "ol-alpha-lower" ? ' type="a"' : kind === "ol-alpha-upper" ? ' type="A"' : ""
    result.push(`<ol${typeAttr}${listIndentStyle(indent)}>`)
    listState = { kind, indent }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const olMatch = line.match(/^(\s*)(\d+)[.)]\s+(.+)$/)
    const alphaMatch = line.match(/^(\s*)([a-zA-Z])[.)]\s+(.+)$/)
    const ulMatch = line.match(/^(\s*)[-*]\s+(.+)$/)
    const bqMatch = line.match(/^>\s?(.*)$/)

    if (olMatch) {
      const indent = getListIndentLevel(olMatch[1])
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!listState || listState.kind !== "ol" || listState.indent !== indent) {
        closeList()
        openList("ol", indent)
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
        closeList()
        openList(listKind, indent)
      }
      result.push(`<li value="${markerValue}">${alphaMatch[3]}</li>`)
    } else if (ulMatch) {
      const indent = getListIndentLevel(ulMatch[1])
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!listState || listState.kind !== "ul" || listState.indent !== indent) {
        closeList()
        openList("ul", indent)
      }
      result.push(`<li>${ulMatch[2]}</li>`)
    } else if (bqMatch) {
      closeList()
      if (!inBlockquote) {
        result.push("<blockquote>")
        inBlockquote = true
      }
      if (bqMatch[1].trim()) {
        result.push(`<p>${bqMatch[1]}</p>`)
      }
    } else {
      closeList()
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

  closeList()
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
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return trimmed.replaceAll('"', "&quot;")
  }
  return "#"
}
