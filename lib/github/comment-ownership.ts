import type { IssueComment } from "./types"
import { isClaBotManagedComment } from "@/lib/pr-comment-template"

export function findLatestManagedClaBotComment(comments: IssueComment[]): IssueComment | null {
  for (let index = comments.length - 1; index >= 0; index -= 1) {
    const candidate = comments[index]
    if (isClaBotManagedComment(candidate.body)) return candidate
  }
  return null
}
