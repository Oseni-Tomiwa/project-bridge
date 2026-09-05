import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

function workspaceSource(path: string): string {
  return fileURLToPath(new URL(path, import.meta.url));
}

export default defineConfig({
  resolve: {
    alias: {
      "@project-bridge/actions": workspaceSource(
        "./packages/actions/src/index.ts",
      ),
      "@project-bridge/benchmark": workspaceSource(
        "./packages/benchmark/src/index.ts",
      ),
      "@project-bridge/conversation": workspaceSource(
        "./packages/conversation/src/index.ts",
      ),
      "@project-bridge/domain": workspaceSource(
        "./packages/domain/src/index.ts",
      ),
      "@project-bridge/shared": workspaceSource(
        "./packages/shared/src/index.ts",
      ),
      "@project-bridge/speech": workspaceSource(
        "./packages/speech/src/index.ts",
      ),
    },
  },
});
