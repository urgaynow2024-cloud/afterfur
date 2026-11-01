import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: ["tests/**", "**/node_modules/**", "**/dist/**", "**/.{idea,git,cache,output,temp}/**"],
  },
});
