/**
 * Guards that `project-structure/independent-modules` actually enforces.
 *
 * Its failure mode is silence: the plugin derives its project root by walking to
 * the first `node_modules` in its own path, which under pnpm is the WORKSPACE
 * root. If `packageRoot` / `pathAliases.baseUrl` in eslint.config.js stop
 * pointing at this package, every linted path arrives as `packages/chat/src/...`,
 * matches none of the `src/**` module patterns, and the rule passes every file
 * without a word. Same if a `{family}` token creeps back into a module
 * `pattern` — those are matched literally, so it matches nothing.
 *
 * That is indistinguishable from a clean codebase, so assert on a violation we
 * know must be reported rather than trusting a green lint run.
 */
import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

const RULE = 'project-structure/independent-modules';

async function lint(filePath: string, code: string) {
  const eslint = new ESLint({ cwd: process.cwd() });
  const [result] = await eslint.lintText(code, { filePath, warnIgnored: false });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE);
}

/** Each case names a boundary the architecture depends on. */
const FORBIDDEN: [name: string, file: string, code: string][] = [
  [
    'a feature reaching into another feature’s internals',
    'src/features/chat/components/probe.ts',
    "import { buildVizTitle } from '@/features/dashboard/utils/vizTitle';",
  ],
  [
    'the same, written relatively',
    'src/features/chat/components/probe.ts',
    "import { buildVizTitle } from '../../dashboard/utils/vizTitle';",
  ],
  [
    'a feature reaching into the composition root beyond the context',
    'src/features/chat/components/probe.ts',
    "import { App } from '@/app/App';",
  ],
  [
    'a UI primitive depending on a feature',
    'src/components/ui/probe.ts',
    "import { buildVizTitle } from '@/features/dashboard';",
  ],
  [
    'a shared type depending on a feature',
    'src/types/probe.ts',
    "import { buildVizTitle } from '@/features/dashboard';",
  ],
];

const ALLOWED: [name: string, file: string, code: string][] = [
  [
    'a feature using another feature’s barrel',
    'src/features/chat/components/probe.ts',
    "import { buildVizTitle } from '@/features/dashboard';",
  ],
  [
    'a feature consuming the per-provider store context',
    'src/features/chat/components/probe.ts',
    "import { useDashboard } from '@/app/UDIChatContext';",
  ],
  [
    'a feature importing within itself',
    'src/features/dashboard/components/probe.ts',
    "import { buildVizTitle } from '../utils/vizTitle';",
  ],
  [
    'a feature using a shared component',
    'src/features/chat/components/probe.tsx',
    "import { FieldTooltipContent } from '@/components/FieldTooltipContent';",
  ],
  [
    'the composition root reaching into a feature internal',
    'src/app/probe.ts',
    "import { buildVizTitle } from '@/features/dashboard/utils/vizTitle';",
  ],
];

describe('module boundaries are enforced, not just configured', () => {
  it.each(FORBIDDEN)('refuses %s', async (_name, file, code) => {
    const messages = await lint(file, `${code}\nexport const probe = 1;\n`);
    expect(messages.length).toBeGreaterThan(0);
  });

  it.each(ALLOWED)('permits %s', async (_name, file, code) => {
    const messages = await lint(file, `${code}\nexport const probe = 1;\n`);
    expect(messages.map((m) => m.message)).toEqual([]);
  });
});
