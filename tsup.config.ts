import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli/index": "src/cli/index.ts",
    "mcp/server": "src/mcp/server.ts"
  },
  format: ["esm"],
  target: "node18",
  dts: true,
  sourcemap: true,
  clean: true
});

