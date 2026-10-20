// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightTypeDoc, { typeDocSidebarGroup } from "starlight-typedoc";

// Served at https://hms-dbmi.github.io/udi-yac/ next to the chat (app/) and the
// grammar demo (grammar/), which pages.yml copies into the same artifact.
// Starlight does not add `base` to links written in markdown, so links in the
// content spell out /udi-yac/.
export default defineConfig({
  site: "https://hms-dbmi.github.io",
  base: "/udi-yac",
  integrations: [
    starlight({
      title: "YAC",
      description:
        "Ask questions of biomedical datasets in plain language and get linked, interactive visualizations.",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/hms-dbmi/udi-yac",
        },
      ],
      editLink: {
        baseUrl: "https://github.com/hms-dbmi/udi-yac/edit/main/apps/site/",
      },
      plugins: [
        starlightTypeDoc({
          entryPoints: ["../../packages/chat/src/index.ts"],
          tsconfig: "../../packages/chat/tsconfig.app.json",
          output: "docs/api",
          sidebar: { label: "UDIChat API", collapsed: true },
          typeDoc: { excludeExternals: true },
        }),
      ],
      sidebar: [
        {
          label: "Using YAC",
          items: [{ autogenerate: { directory: "docs/using" } }],
        },
        { label: "Chart gallery", link: "/docs/charts/" },
        {
          label: "Integrate",
          items: [{ autogenerate: { directory: "docs/integrate" } }],
        },
        typeDocSidebarGroup,
        { label: "Open the app", link: "/app/", attrs: { target: "_self" } },
        {
          label: "Grammar demo",
          link: "/grammar/",
          attrs: { target: "_self" },
        },
      ],
    }),
  ],
});
