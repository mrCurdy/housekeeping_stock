/** Set by tsup at build time (tsup.config.ts); missing when run from source (dev, tests). */
declare const __BUILD__: { builtAt: string; commit: string } | undefined;

/**
 * Which code this server runs, shown by GET /health. After a source change, a `builtAt` older
 * than the change means a stale build is still serving (restart, or use `npm run dev`).
 */
export const build =
  typeof __BUILD__ === 'undefined' ? { builtAt: null, commit: 'source' } : __BUILD__;
