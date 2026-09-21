#!/usr/bin/env node
/**
 * Regenerate the template studio's preview JSON by invoking the agent's
 * Python exporter.
 *
 * The studio renders the agent's visualization templates, and resolving their
 * placeholders is Python-only logic (`udiagent.vis_generate`). This wrapper is
 * what the studio's `dev`/`build` scripts call so the uv invocation lives in one
 * place.
 *
 * Deliberately exits 0 when the export fails or uv is unavailable: the studio is
 * a dev-only tool and shows an actionable message when the previews file is
 * missing, which beats making `pnpm dev` unrunnable on a machine without uv.
 *
 * Usage: node scripts/sync-template-previews.mjs <out-file>   (CWD-relative)
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const agentDir = join(repoRoot, 'packages', 'agent');
const script = join(agentDir, 'scripts', 'export_template_previews.py');

const out = resolve(process.argv[2] ?? 'public/template_previews.json');

const result = spawnSync('uv', ['run', '--project', agentDir, 'python', script, '--out', out], {
  stdio: 'inherit',
});

if (result.error?.code === 'ENOENT') {
  console.warn(
    '[template-previews] uv not found — skipping preview export.\n' +
      '  Install uv (https://docs.astral.sh/uv/) and re-run to render live template previews.',
  );
  process.exit(0);
}

if (result.status !== 0) {
  console.warn(
    `[template-previews] export failed (exit ${result.status}) — the studio will ` +
      'show a "previews missing" message until it succeeds.',
  );
}

process.exit(0);
