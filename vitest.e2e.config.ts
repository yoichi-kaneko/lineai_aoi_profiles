import { defineConfig } from "vitest/config";

/** 層2（実画像を通した E2E）専用。`pnpm test:e2e` から使う。 */
export default defineConfig({
  test: {
    include: ["test/**/*.e2e.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
