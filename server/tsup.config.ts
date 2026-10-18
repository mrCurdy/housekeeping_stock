import { execSync } from 'node:child_process';
import { defineConfig } from 'tsup';

/** The commit being built ('unknown' without git, e.g. in Docker, where .git is ignored). */
function commit() {
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] });
    const dirty = execSync('git status --porcelain', { stdio: ['ignore', 'pipe', 'ignore'] });
    return sha.toString().trim() + (dirty.toString().trim() ? '-dirty' : '');
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // Bundle the workspace package (it ships TS source); keep real npm deps external.
  noExternal: ['@app/shared'],
  // Shown by GET /health (src/build.ts), so a stale build is easy to spot
  define: {
    __BUILD__: JSON.stringify({ builtAt: new Date().toISOString(), commit: commit() }),
  },
});
