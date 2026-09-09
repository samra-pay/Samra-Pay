import { build } from "esbuild";
await build({
  entryPoints: ["src/marketing-entry.mjs"],
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  outfile: "dist/marketing-entry.mjs",
  external: ["pg-native"],
  banner: {
    js: "import {createRequire as __samraCreateRequire} from 'node:module'; const require=__samraCreateRequire(import.meta.url);",
  },
});
