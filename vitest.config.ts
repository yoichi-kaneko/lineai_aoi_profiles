import { defineConfig } from "vitest/config";

/**
 * 既定（`pnpm test`）は層1のみを実行する。
 * 層2（`*.e2e.test.ts`）は OCR に1枚あたり約20秒かかるため、`pnpm test:e2e` で明示的に実行する。
 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**", "test/**/*.e2e.test.ts"],
  },
});
