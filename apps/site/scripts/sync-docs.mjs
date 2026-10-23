// Generates the docs pages that have a source of truth elsewhere in the repo:
// the integrator and backend pages (copied from the package READMEs and docs),
// the Python API reference (griffe2md over the agent's docstrings) and the chart
// gallery (from the agent's template JSON). Output is gitignored; run on
// dev/build.
//
//   node scripts/sync-docs.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SITE, '../..');
const DOCS = join(SITE, 'src/content/docs/docs');
const BLOB = 'https://github.com/hms-dbmi/udi-yac/blob/main/';
const RAW = 'https://raw.githubusercontent.com/hms-dbmi/udi-yac/main/';

// Markdown file (repo path) → page under /docs/, in sidebar order per section.
const SECTIONS = ['integrate', 'backend'];
const PAGES = [
  ['packages/chat/README.md', 'integrate/chat', 'Embed the chat (udi-yac)'],
  ['sample-data/readme.md', 'integrate/data-packages', 'Data package format'],
  ['packages/grammar/README.md', 'integrate/toolkit', 'Grammar toolkit (udi-toolkit)'],
  [
    'packages/grammar-py/README.md',
    'integrate/grammar-py',
    'Python grammar builder (udi-grammar-py)',
  ],
  ['packages/agent/README.md', 'backend/agent', 'Agent overview (udiagent)'],
  ['packages/agent/docs/library.md', 'backend/library', 'Library usage'],
  ['packages/agent/docs/server.md', 'backend/server', 'Running the server'],
  ['packages/agent/docs/deployment.md', 'backend/deployment', 'Deployment guide'],
  ['packages/agent/docs/architecture.md', 'backend/architecture', 'How the agent works'],
  [
    'packages/agent/src/udiagent/query/README.md',
    'backend/server-side-data',
    'Server-side data (SQL)',
  ],
  ['packages/agent/docs/benchmarking.md', 'backend/benchmarking', 'Benchmarking'],
];
const PAGE_FOR = new Map(PAGES.map(([path, page]) => [path, `/udi-yac/docs/${page}/`]));

const frontmatter = (fields) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\n`;

/** Repo-relative links in a synced file point at files on GitHub, or at their
 *  synced page when that file is itself one of the PAGES. */
function rewriteLink(target, readmePath) {
  if (/^([a-z]+:|#|\/)/i.test(target)) return target;
  const [path, anchor] = target.split('#');
  const repoPath = posix.normalize(posix.join(posix.dirname(readmePath), path));
  const page = PAGE_FOR.get(repoPath);
  if (page) return page + (anchor ? `#${anchor}` : '');
  return (
    (/\.(png|jpe?g|gif|svg|webp)$/i.test(repoPath) ? RAW : BLOB) +
    repoPath +
    (anchor ? `#${anchor}` : '')
  );
}

function syncPage([readmePath, page, title], order) {
  let inFence = false;
  const body = readFileSync(join(REPO, readmePath), 'utf8')
    .replace(/^# .*\n+/, '') // the page title comes from frontmatter
    .split('\n')
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
      if (inFence) return line;
      return line
        .replace(/(\]\()([^)\s]+)/g, (_, open, t) => open + rewriteLink(t, readmePath))
        .replace(/(\bsrc=")([^"]+)/g, (_, open, t) => open + rewriteLink(t, readmePath));
    })
    .join('\n');
  const note = `:::note[Generated page]\nCopied from [\`${readmePath}\`](${BLOB}${readmePath}) on every docs build. Edit that file, not this page.\n:::\n\n`;
  writeFileSync(join(DOCS, `${page}.md`), frontmatter({ title, sidebar: { order } }) + note + body);
}

// --- Python API reference ---------------------------------------------------

/** griffe2md links members by dotted path (`#udiagent.Usage.add`), but
 *  Starlight slugs headings from their text, which drops the dots. Point links
 *  at headings on this page and unwrap the rest (builtins, private modules). */
function relinkPythonApi(md) {
  const headings = new Set([...md.matchAll(/^#+ `([\w.]+)`$/gm)].map(([, path]) => path));
  return md.replace(/\[([^\]]*)\]\(#([\w.]+)\)/g, (_, text, path) =>
    headings.has(path) ? `[${text}](#${path.toLowerCase().replaceAll('.', '')})` : text,
  );
}

/** The public API of `udiagent` and `udiagent.query`, from their docstrings.
 *  griffe2md reads the source statically (configured in the agent's
 *  pyproject.toml), so none of the agent's dependencies need installing. */
function syncPythonApi(order) {
  const runs = ['udiagent', 'udiagent.query'].map((pkg) =>
    spawnSync('uvx', ['griffe2md@1.5.1', pkg], {
      cwd: join(REPO, 'packages/agent'),
      encoding: 'utf8',
    }),
  );
  const failed = runs.find((run) => run.error || run.status !== 0);
  if (failed?.error?.code === 'ENOENT' && !process.env.CI) {
    console.warn('sync-docs: uvx not found, skipping the Python API reference (install uv)');
    return;
  }
  if (failed) throw new Error(`griffe2md failed: ${failed.error ?? failed.stderr}`);
  const note = `:::note[Generated page]\nBuilt from the docstrings in [\`packages/agent/src/udiagent\`](${BLOB}packages/agent/src/udiagent) on every docs build. For how the pieces fit together, see [How the agent works](/udi-yac/docs/backend/architecture/).\n:::\n\n`;
  writeFileSync(
    join(DOCS, 'backend/python-api.md'),
    frontmatter({ title: 'Python API reference', sidebar: { order } }) +
      note +
      relinkPythonApi(runs.map((run) => run.stdout).join('\n')),
  );
}

// --- chart gallery --------------------------------------------------------

const TYPE_LABELS = {
  barchart: 'Bar charts',
  stacked_bar: 'Stacked bar charts',
  line: 'Line charts and survival curves',
  grouped_line: 'Grouped line charts',
  area: 'Area charts',
  grouped_area: 'Grouped area charts',
  histogram: 'Histograms',
  scatterplot: 'Scatterplots',
  grouped_scatter: 'Grouped scatterplots',
  dot: 'Dot plots',
  grouped_dot: 'Grouped dot plots',
  heatmap: 'Heatmaps',
  circular: 'Pie and donut charts',
  table: 'Tables',
};

const escape = (s) => String(s ?? '').replace(/</g, '&lt;');

/** `<E1.F2>` and friends are slots the agent fills with the dataset's own
 *  tables and fields; a reader needs the kind of slot, not its index. */
const humanize = (title) =>
  escape(title).replace(/&lt;([^>]+)>/g, (_, slot) => {
    if (/F/.test(slot)) return '*field*';
    if (/^E\d*$/.test(slot)) return '*table*';
    if (/^M/.test(slot)) return '*measure*';
    if (/^D/.test(slot)) return '*dimension*';
    return `*${slot.toLowerCase()}*`;
  });

function syncCharts() {
  const templates = JSON.parse(
    readFileSync(
      join(REPO, 'packages/agent/src/udiagent/data/skills/template_visualizations.json'),
      'utf8',
    ),
  );
  const byType = Map.groupBy(templates, (t) => t.chart_type);
  const sections = [...byType]
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([type, list]) => {
      const entries = list.map(
        (t) =>
          `### ${humanize(t.title_template)}\n\n${escape(t.description)}\n\n**Good for:** ${escape(t.tasks)} · *${escape(t.chart_complexity)}*\n`,
      );
      return `## ${TYPE_LABELS[type] ?? type}\n\n${entries.join('\n')}`;
    });
  const intro = `YAC draws most charts from a library of ${templates.length} templates. When you ask a question, the agent picks a template and binds its *table* and *field* slots to your dataset; the dropdowns under a chart in the chat change those bindings. If no template fits, the agent writes a chart from scratch.\n\n:::note[Generated page]\nBuilt from [\`template_visualizations.json\`](${BLOB}packages/agent/src/udiagent/data/skills/template_visualizations.json) on every docs build.\n:::\n\n`;
  writeFileSync(
    join(DOCS, 'charts.md'),
    frontmatter({
      title: 'Chart gallery',
      tableOfContents: { maxHeadingLevel: 2 },
    }) +
      intro +
      sections.join('\n'),
  );
}

for (const section of SECTIONS) {
  rmSync(join(DOCS, section), { recursive: true, force: true });
  mkdirSync(join(DOCS, section), { recursive: true });
}
PAGES.forEach((p, i) => syncPage(p, i + 1));
syncPythonApi(PAGES.length + 1);
syncCharts();
console.log(
  `sync-docs: ${PAGES.length} pages + Python API + chart gallery → ${relative(REPO, DOCS)}`,
);
