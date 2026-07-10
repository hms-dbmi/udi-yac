import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
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

export default defineConfig(({ mode }) => ({
  base: mode === 'lib' ? '/' : (process.env.VITE_BASE ?? '/'),
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
            // No insertTypesEntry: under rolldown-vite it wrote an empty
            // `export {}` stub at dist/index.d.ts (its computed source-entry
            // path didn't match an emitted file). The real barrel is emitted at
            // dist/src/index.d.ts; package.json "types" points there directly.
            include: ['src'],
            exclude: ['src/app/App.tsx', 'src/app/main.tsx'],
            tsconfigPath: resolve(__dirname, 'tsconfig.app.json'),
          }),
          rewriteExternalRequire(),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  build:
    mode === 'lib'
      ? {
          lib: {
            entry: resolve(__dirname, 'src/index.ts'),
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
