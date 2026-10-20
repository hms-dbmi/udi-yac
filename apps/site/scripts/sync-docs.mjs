// Generates the docs pages that have a source of truth elsewhere in the repo:
// the integrator pages (copied from the package READMEs) and the chart gallery
// (from the agent's template JSON). Output is gitignored; run on dev/build.
//
//   node scripts/sync-docs.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(SITE, '../..');
const DOCS = join(SITE, 'src/content/docs/docs');
const BLOB = 'https://github.com/hms-dbmi/udi-yac/blob/main/';
const RAW = 'https://raw.githubusercontent.com/hms-dbmi/udi-yac/main/';

// README (repo path) → page slug under /docs/integrate/, in sidebar order.
const READMES = [
  ['packages/chat/README.md', 'chat', 'Embed the chat (udi-yac)'],
  ['packages/agent/README.md', 'agent', 'Run the agent server (udiagent)'],
  ['sample-data/readme.md', 'data-packages', 'Data package format'],
  ['packages/agent/src/udiagent/query/README.md', 'server-side-data', 'Server-side data (SQL)'],
  ['packages/grammar/README.md', 'toolkit', 'Grammar toolkit (udi-toolkit)'],
  ['packages/grammar-py/README.md', 'grammar-py', 'Python grammar builder (udi-grammar-py)'],
];
const PAGE_FOR = new Map(READMES.map(([path, slug]) => [path, `/udi-yac/docs/integrate/${slug}/`]));

const frontmatter = (fields) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join('\n')}\n---\n\n`;

/** Repo-relative links in a README point at files on GitHub, or at their
 *  synced page when that file is itself one of the READMEs. */
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

function syncReadme([readmePath, slug, title], order) {
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
  const note = `:::note[Generated page]\nCopied from [\`${readmePath}\`](${BLOB}${readmePath}) on every docs build. Edit the README, not this page.\n:::\n\n`;
  writeFileSync(
    join(DOCS, 'integrate', `${slug}.md`),
    frontmatter({ title, sidebar: { order } }) + note + body,
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

rmSync(join(DOCS, 'integrate'), { recursive: true, force: true });
mkdirSync(join(DOCS, 'integrate'), { recursive: true });
READMES.forEach((r, i) => syncReadme(r, i + 1));
syncCharts();
console.log(`sync-docs: ${READMES.length} READMEs + chart gallery → ${relative(REPO, DOCS)}`);
