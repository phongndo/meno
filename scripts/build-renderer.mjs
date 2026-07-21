import { build } from "esbuild";

await build({
  bundle: true,
  entryPoints: ["src/renderer/index.ts"],
  format: "esm",
  outfile: "dist/renderer/index.js",
  platform: "browser",
  sourcemap: true,
});
