// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// Served at https://hms-dbmi.github.io/udi-yac/. The site also serves the chat
// at app/ (src/pages/app, embedding the udi-yac library); the grammar demo at
// grammar/ is a separate build that pages.yml copies into the same artifact.
// Starlight does not add `base` to links written in markdown, so links in the
// content spell out /udi-yac/.
/**
 * @param {number} port
 * @param {string} task The VS Code task that serves this port, named in the
 *   page shown when nothing is listening (Vite's own is a blank 502).
 */
const devProxy = (port, task) => ({
  target: `http://localhost:${port}`,
  ws: true,
  /** @param {string} path */
  rewrite: (path) => (path.startsWith('/udi-yac/') ? path : `/udi-yac${path}`),
  configure: (proxy) =>
    proxy.on('error', (_err, _req, res) => {
      if (!('writeHead' in res) || res.headersSent) return;
      res
        .writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end(
          `Nothing is listening on localhost:${port}.\n\n` +
            `Start the "${task}" VS Code task, or "Dev: all" for everything. ` +
            'See "Local development" in apps/site/README.md.',
        );
    }),
});

/** GitHub Pages redirects /udi-yac/app to /udi-yac/app/. In dev the app page
 *  would be served without the slash, resolving the chat's page-relative data
 *  paths one level too high, and the proxied grammar demo would 404. */
/** @type {import('vite').Plugin} */
const devTrailingSlash = {
  name: 'udi-yac-dev-trailing-slash',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const match = req.url?.match(/^\/(?:udi-yac\/)?(app|grammar)(\?.*)?$/);
      if (!match) return next();
      res.writeHead(301, { Location: `/udi-yac/${match[1]}/${match[2] ?? ''}` }).end();
    });
  },
};

export default defineConfig({
  site: 'https://hms-dbmi.github.io',
  base: '/udi-yac',
  vite: {
    plugins: [devTrailingSlash],
    // The app page reads the chat's own VITE_UDI_* settings (API URL, key
    // prompt, model), from the chat's .env/.env.local in dev. Its data package
    // vars are ignored here: the site picks packages from the catalog.
    envPrefix: ['PUBLIC_', 'VITE_UDI_'],
    envDir: '../../packages/chat',
    server: {
      // Dev only: the grammar demo is a separate dev server (see
      // apps/site/README.md); proxying it makes the site's links resolve in dev
      // the way they do in the assembled Pages build. Astro strips `base` from
      // HTTP requests before Vite's proxy sees them (websocket upgrades keep
      // it), so the rule matches both forms and puts the prefix back.
      proxy: {
        '^/(udi-yac/)?grammar(/|$)': devProxy(9000, 'Dev: grammar app'),
      },
    },
  },
  integrations: [
    react(),
    starlight({
      title: 'YAC',
      description:
        'Ask questions of biomedical datasets in plain language and get linked, interactive visualizations.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/hms-dbmi/udi-yac',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/hms-dbmi/udi-yac/edit/main/apps/site/',
      },
      plugins: [
        starlightTypeDoc({
          entryPoints: ['../../packages/chat/src/index.ts'],
          tsconfig: '../../packages/chat/tsconfig.app.json',
          output: 'docs/api',
          sidebar: { label: 'UDIChat API', collapsed: true },
          typeDoc: { excludeExternals: true },
        }),
      ],
      sidebar: [
        {
          label: 'Using YAC',
          items: [{ autogenerate: { directory: 'docs/using' } }],
        },
        { label: 'Chart gallery', link: '/docs/charts/' },
        {
          label: 'Integrate',
          items: [{ autogenerate: { directory: 'docs/integrate' } }],
        },
        typeDocSidebarGroup,
        { label: 'Open the app', link: '/app/', attrs: { target: '_self' } },
        {
          label: 'Grammar demo',
          link: '/grammar/',
          attrs: { target: '_self' },
        },
      ],
    }),
  ],
});
