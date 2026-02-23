"use client"

import { cn } from "@/lib/utils"

/**
 * A simple markdown-to-HTML renderer for CLA display.
 * In production, use a proper markdown parser like `marked` or `react-markdown`.
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

function simpleMarkdownToHtml(md: string): string {
  const html = md
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
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    )
    // Horizontal rules
    .replace(/^---$/gm, "<hr>")

  // Process lists and blockquotes
  const lines = html.split("\n")
  const result: string[] = []
  let inOl = false
  let inUl = false
  let inBlockquote = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const olMatch = line.match(/^\d+\.\s+(.+)$/)
    const ulMatch = line.match(/^[-*]\s+(.+)$/)
    const bqMatch = line.match(/^>\s?(.*)$/)

    if (olMatch) {
      if (inUl) {
        result.push("</ul>")
        inUl = false
      }
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!inOl) {
        result.push("<ol>")
        inOl = true
      }
      result.push(`<li>${olMatch[1]}</li>`)
    } else if (ulMatch) {
      if (inOl) {
        result.push("</ol>")
        inOl = false
      }
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      if (!inUl) {
        result.push("<ul>")
        inUl = true
      }
      result.push(`<li>${ulMatch[1]}</li>`)
    } else if (bqMatch) {
      if (inOl) {
        result.push("</ol>")
        inOl = false
      }
      if (inUl) {
        result.push("</ul>")
        inUl = false
      }
      if (!inBlockquote) {
        result.push("<blockquote>")
        inBlockquote = true
      }
      if (bqMatch[1].trim()) {
        result.push(`<p>${bqMatch[1]}</p>`)
      }
    } else {
      if (inOl) {
        result.push("</ol>")
        inOl = false
      }
      if (inUl) {
        result.push("</ul>")
        inUl = false
      }
      if (inBlockquote) {
        result.push("</blockquote>")
        inBlockquote = false
      }
      // <sub> tags (for footer branding)
      if (line.trim().startsWith("<sub>")) {
        result.push(line)
      } else if (
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

  if (inOl) result.push("</ol>")
  if (inUl) result.push("</ul>")
  if (inBlockquote) result.push("</blockquote>")

  return result.join("\n")
}
