import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.{js,mjs,ts,tsx}"],
    exclude: ["node_modules/**", "dist/**", "tmp/**", "desktop/vendor/**"],
    environment: "node",
  },
});
