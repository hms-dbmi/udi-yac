// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc';

// Served at https://hms-dbmi.github.io/udi-yac/ next to the chat (app/) and the
// grammar demo (grammar/), which pages.yml copies into the same artifact.
// Starlight does not add `base` to links written in markdown, so links in the
// content spell out /udi-yac/.
/** @param {number} port */
const devProxy = (port) => ({
  target: `http://localhost:${port}`,
  ws: true,
  /** @param {string} path */
  rewrite: (path) => (path.startsWith('/udi-yac/') ? path : `/udi-yac${path}`),
});

/** GitHub Pages redirects /udi-yac/app to /udi-yac/app/; the proxied dev
 *  servers would 404 it instead (and a page served without the slash would
 *  resolve the chat's relative data paths one level too high). */
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
    server: {
      // Dev only. The `Dev: site` VS Code task also runs the chat under
      // /udi-yac/app/ on :5176; `Dev: grammar app` serves /udi-yac/grammar/ on
      // :9000. Proxying both makes the site's links into them resolve in dev
      // the way they do in the assembled Pages build. Astro strips `base` from
      // HTTP requests before Vite's proxy sees them (websocket upgrades keep
      // it), so each rule matches both forms and puts the prefix back.
      proxy: {
        '^/(udi-yac/)?app(/|$)': devProxy(5176),
        '^/(udi-yac/)?grammar(/|$)': devProxy(9000),
      },
    },
  },
  integrations: [
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
