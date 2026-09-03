/**
 * Load `embedded-postgres` without letting it hijack the process exit code.
 *
 * `embedded-postgres` registers a global shutdown hook through `async-exit-hook`,
 * which listens to Node's `beforeExit` event and then calls `process.exit(0)`.
 * That discards `process.exitCode`, so any process that imports the library and
 * exits naturally reports success: a vitest run with failing tests, or a wrapper
 * that set `process.exitCode` from a child's status, both exit 0.
 *
 * The hook only exists to stop clusters that were never stopped explicitly. We
 * always stop ours, so we remove the `beforeExit` and `exit` listeners it added
 * (and only those) immediately after importing the module. The `exit` listener
 * has to go too: once `beforeExit` no longer runs first, the library invokes its
 * async shutdown from the synchronous `exit` path without a callback and throws
 * `done is not a function`, which would turn a green run into exit code 1.
 * Signal handling (SIGINT/SIGTERM) is left in place.
 */

type EmbeddedPostgresModule = typeof import("embedded-postgres")
export type EmbeddedPostgresCtor = EmbeddedPostgresModule["default"]

const EVENTS_TO_UNHOOK = ["beforeExit", "exit"] as const
type UnhookedEvent = (typeof EVENTS_TO_UNHOOK)[number]

// `process.listeners` / `removeListener` are typed per event name; the two we
// care about share the same listener shape, so narrow through "exit".
function listenersOf(event: UnhookedEvent) {
  return process.listeners(event as "exit")
}

let loaded: Promise<EmbeddedPostgresCtor> | null = null

export function loadEmbeddedPostgres(): Promise<EmbeddedPostgresCtor> {
  if (!loaded) {
    loaded = (async () => {
      const before = new Map(
        EVENTS_TO_UNHOOK.map((event) => [event, new Set(listenersOf(event))] as const)
      )
      const mod = await import("embedded-postgres")
      for (const event of EVENTS_TO_UNHOOK) {
        const existing = before.get(event)
        for (const listener of listenersOf(event)) {
          if (!existing?.has(listener)) {
            process.removeListener(event as "exit", listener)
          }
        }
      }
      return mod.default
    })()
  }
  return loaded
}
