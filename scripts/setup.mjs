#!/usr/bin/env node
// One-shot dev-environment bootstrap for onboarding:
//   1. create local env files from their templates (never overwrites)
//   2. install JS deps (pnpm) + build the toolkit that chat/grammar-app need
//   3. install Python deps (uv, all extras — includes the FastAPI server)
// Idempotent: safe to re-run. Invoke with `pnpm setup` or `node scripts/setup.mjs`.
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const abs = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const run = (cmd) => execSync(cmd, { stdio: 'inherit', cwd: root });
const has = (cmd) => {
  try {
    execSync(`${cmd} --version`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

// 1. Local env files — copy template → target only if the target is absent.
const envFiles = [
  ['packages/chat/.env.example', 'packages/chat/.env.local'],
  ['packages/agent/.env.template', 'packages/agent/.env'],
];
console.log('› env files');
for (const [tpl, dest] of envFiles) {
  if (existsSync(abs(dest))) {
    console.log(`  ✓ ${dest} already exists`);
  } else {
    copyFileSync(abs(tpl), abs(dest));
    console.log(`  ＋ created ${dest} (from ${tpl})`);
  }
}

// 2. JS workspace.
console.log('\n› JS dependencies (pnpm)');
if (!has('pnpm')) {
  console.error(
    '  ✗ pnpm not found. Enable it with `corepack enable` (Node ≥ 22) or see https://pnpm.io/installation',
  );
  process.exit(1);
}
run('pnpm install');
run('pnpm run build:toolkit'); // chat + grammar-app resolve udi-toolkit from dist/

// 3. Python workspace.
console.log('\n› Python dependencies (uv)');
if (!has('uv')) {
  console.error(
    '  ✗ uv not found. Install it: https://docs.astral.sh/uv/getting-started/installation/',
  );
  process.exit(1);
}
run('uv sync --all-extras');

// A blank key is otherwise a fully "successful" setup whose failure only shows
// up as a 401 on the first chat message.
const agentEnv = readFileSync(abs('packages/agent/.env'), 'utf8');
const hasKey = /^OPENAI_API_KEY=\S/m.test(agentEnv);

console.log(
  '\n✓ Setup complete. Run the "Dev: chat + agent" VS Code task ' +
    '(Ctrl/Cmd+Shift+B)\n  or `pnpm dev:chat` / `pnpm dev:agent`.',
);
if (!hasKey) {
  console.log(
    '\n⚠ OPENAI_API_KEY is empty in packages/agent/.env — set it, or the first\n' +
      '  chat message will come back 401. (Alternatively set\n' +
      '  VITE_UDI_REQUIRE_API_KEY=true in packages/chat/.env.local to have the UI\n' +
      '  prompt each user for their own key.)',
  );
}
