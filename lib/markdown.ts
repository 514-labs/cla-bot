export function slugifyHeading(text: string) {
  return text
    .toLowerCase()
    .replace(/&[^;\s]+;/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
}
