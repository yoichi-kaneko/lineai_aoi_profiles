import { defineConfig } from "vitest/config";

/** `pnpm test` で test/ 配下のテストをすべて実行する。 */
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
  },
});
