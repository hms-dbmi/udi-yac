import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import { createRequire } from 'node:module';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import dts from 'vite-plugin-dts';

// React (+ its subpaths) are peer deps and MUST stay external. Bundling a
// second copy gives the lib its own React instance whose hook dispatcher is
// never installed by the consumer's renderer, so the first hook (useRef) reads
// a null dispatcher → "can't access property useRef, O() is null". Everything
// else (arquero/vega, pulled in via udi-toolkit) is deliberately bundled so
// consumers don't have to install it — only React breaks when duplicated.
const isReactExternal = (id: string) =>
  id === 'react' || id === 'react-dom' || id.startsWith('react/') || id.startsWith('react-dom/');

// Matches a bare `<ident>("react"|"react-dom"|"react/…"|"react-dom/…")` call —
// i.e. rolldown's runtime require shim for an externalized React module. (The
// react-dom branch comes first so the id class is matched whole.)
const REACT_REQUIRE_RE =
  /\b[A-Za-z_$][\w$]*\(\s*"(react-dom(?:\/[\w.$/-]+)?|react(?:\/[\w.$/-]+)?)"\s*\)/g;

// Rolldown leaves `require("react")` inside __commonJS-wrapped CJS deps
// (use-sync-external-store, react-grid-layout, clsx, …) as a runtime shim that
// throws "Calling require for react …" in the browser. The builtin
// esmExternalRequirePlugin does NOT rewrite these here, so point each such
// require at a real ESM namespace import of the external instead — reusing the
// `import * as NS from "react"` binding rolldown already emitted where present.
function rewriteExternalRequire(): Plugin {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    name: 'rewrite-external-require',
    enforce: 'post',
    renderChunk(code) {
      const ns = new Map<string, string>(); // module id → namespace local name
      const injected: string[] = [];
      let out = code.replace(REACT_REQUIRE_RE, (_m, mod: string) => {
        let name = ns.get(mod);
        if (!name) {
          const existing = code.match(
            new RegExp(`import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s*from\\s*"${esc(mod)}"`),
          );
          name = existing ? existing[1] : `__req_${mod.replace(/[^\w$]/g, '_')}`;
          if (!existing) injected.push(`import * as ${name} from "${mod}";`);
          ns.set(mod, name);
        }
        return name;
      });
      if (out === code) return null;
      out = injected.join('\n') + (injected.length ? '\n' : '') + out;
      // Guard: if any external require shim survived the rewrite, fail the build
      // loudly rather than shipping a bundle that throws at runtime.
      const missed = out.match(REACT_REQUIRE_RE);
      if (missed) this.error(`external require shim not rewritten: ${missed[0]}`);
      return { code: out, map: null };
    },
  };
}

// react-markdown -> micromark -> decode-named-character-reference ships a
// `browser` export condition (index.dom.js) whose *module top level* runs
// `document.createElement('i')`. A lib build resolves that condition, so
// `import 'udi-yac'` threw "document is not defined" in a host's SSR before any
// component rendered — and that's frozen at publish time, so consumers can't
// work around it. Its default entry is pure JS.
//
// Dropping the `browser` condition wholesale would also swap vega/arquero/
// ag-grid onto their non-browser entries, so patch just this one: CJS
// `require.resolve` walks the same `exports` map under ["require","node"],
// which lands on `default` -> index.js. Resolving from the importer keeps each
// of pnpm's copies pointed at its own on-disk file. test/ssr-import.mjs guards
// the general case.
const DOM_UNSAFE_PKG = 'decode-named-character-reference';

function resolveNonBrowserVariant(): Plugin {
  return {
    name: 'resolve-non-browser-variant',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id !== DOM_UNSAFE_PKG || !importer) return null;
      try {
        return createRequire(importer).resolve(id);
      } catch {
        // Virtual importer, or the package moved — fall through to Vite's
        // resolver. ssr-import.mjs is what actually fails the build then.
        return null;
      }
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Lib mode uses './' so any emitted asset URL is relative to the stylesheet
  // rather than to the consuming site's root — a root-absolute `url(/assets/…)`
  // would resolve against the *host's* origin and 404. Today nothing depends on
  // this (lib mode inlines the Geist woff2 files as data URIs), but it makes the
  // property hold by construction rather than by accident of the inline limit.
  base: mode === 'lib' ? './' : (process.env.VITE_BASE ?? '/'),
  // react-draggable@4.7.0 reads unguarded `process.env.DRAGGABLE_DEBUG`, which
  // throws `process is not defined` in the browser (drag/resize dies on
  // mousedown). Vite only auto-replaces NODE_ENV, so stub this one out.
  define: {
    'process.env.DRAGGABLE_DEBUG': 'undefined',
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(mode === 'lib'
      ? [
          dts({
            // Colocated tests and the vitest setup file live under src/, so
            // without these they'd ship as ~30 useless `*.test.d.ts`.
            exclude: ['src/app/App.tsx', 'src/app/main.tsx', 'src/**/*.test.*', 'src/test/**'],
            tsconfigPath: resolve(import.meta.dirname, 'tsconfig.app.json'),
            // Bundle every declaration into a single dist/index.d.ts. The
            // mirrored-tree emit resolved the `@/` alias one directory too deep
            // (`../../types/dataPackage` from dist/src/app/, which escapes
            // dist/src), leaving several exported types unusable; a single file
            // has no relative paths left to get wrong. `bundledPackages` inlines
            // udi-toolkit's types, so the published d.ts names neither
            // udi-toolkit nor its `pinia` peer — both of which we deliberately
            // don't ship as runtime dependencies, since udi-toolkit is bundled
            // into udi-yac.js.
            bundleTypes: { bundledPackages: ['udi-toolkit'] },
          }),
          rewriteExternalRequire(),
          resolveNonBrowserVariant(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
  // `public/` holds the dev/demo data packages (~19 MB, including CSVs we don't
  // redistribute) plus SPA-only icons. Vite copies it into dist in lib mode too,
  // and `files: ["dist"]` would then ship it all. The library reads its data
  // package from a URL the consumer supplies, so it needs none of it.
  publicDir: mode === 'lib' ? false : 'public',
  build:
    mode === 'lib'
      ? {
          lib: {
            entry: resolve(import.meta.dirname, 'src/index.ts'),
            name: 'UDIYac',
            fileName: 'udi-yac',
            formats: ['es'] as const,
          },
          rollupOptions: {
            // Keeps React out of the bundle. CJS deps that then `require` it are
            // patched by rewriteExternalRequire() above (rolldown's builtin
            // esm-external-require plugin doesn't rewrite them in this setup).
            external: isReactExternal,
            output: {
              globals: {
                react: 'React',
                'react-dom': 'ReactDOM',
              },
            },
          },
          cssCodeSplit: false,
        }
      : {},
}));
