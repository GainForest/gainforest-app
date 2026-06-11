import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["app/**/*.test.ts", "components/**/*.test.ts", "lib/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
