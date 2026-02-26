// Vitest mock for the `server-only` package.
// In a real Next.js app, importing `server-only` from a Client Component throws.
// Integration tests run in plain Node via Vitest (no Next.js runtime), so we
// replace the package with a no-op to allow direct imports of server modules.
export {}
