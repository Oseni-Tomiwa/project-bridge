import { describe, expect, it } from "vitest";

import {
  loadLocalAudio,
  resolveAudioPathFromArgv,
  type LocalAudioFileSystem,
} from "../src/cli/local-audio.js";

const regularFile = {
  isFile: () => true,
  isDirectory: () => false,
};

function fileSystem(
  overrides: Partial<LocalAudioFileSystem> = {},
): LocalAudioFileSystem {
  return {
    stat: async () => regularFile,
    readFile: async () => new Uint8Array([1, 2, 3]),
    ...overrides,
  };
}

function nodeError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

describe("provider smoke-test local audio loading", () => {
  it("skips pnpm's -- separator and reads an absolute macOS path", async () => {
    const expectedPath = "/Users/example/Downloads/yoruba-test.m4a";
    const argv = ["node", "intron-sahara-smoke.js", "--", expectedPath];
    const calls: string[] = [];
    const resolved = resolveAudioPathFromArgv(argv, "/workspace/project");
    expect(resolved).toBe(expectedPath);

    const result = await loadLocalAudio(
      resolved!,
      fileSystem({
        stat: async (path) => {
          calls.push(`stat:${path}`);
          return regularFile;
        },
        readFile: async (path) => {
          calls.push(`read:${path}`);
          return new Uint8Array([4, 5, 6]);
        },
      }),
    );

    expect(calls).toEqual([`stat:${expectedPath}`, `read:${expectedPath}`]);
    expect(result).toEqual({
      ok: true,
      value: {
        bytes: new Uint8Array([4, 5, 6]),
        fileName: "yoruba-test.m4a",
        mediaType: "audio/mp4",
        resolvedPath: expectedPath,
      },
    });
  });

  it("resolves cwd-relative paths after parsing arguments", () => {
    expect(
      resolveAudioPathFromArgv(
        ["node", "smoke.js", "samples/yoruba-test.m4a"],
        "/workspace/project",
      ),
    ).toBe("/workspace/project/samples/yoruba-test.m4a");
  });

  it("distinguishes a missing file", async () => {
    await expect(
      loadLocalAudio(
        "/missing.m4a",
        fileSystem({
          stat: async () => await Promise.reject(nodeError("ENOENT")),
        }),
      ),
    ).resolves.toEqual({ ok: false, status: "file-not-found" });
  });

  it("distinguishes permission denial", async () => {
    await expect(
      loadLocalAudio(
        "/private.m4a",
        fileSystem({
          readFile: async () => await Promise.reject(nodeError("EACCES")),
        }),
      ),
    ).resolves.toEqual({ ok: false, status: "permission-denied" });
  });

  it("distinguishes a directory from a file", async () => {
    await expect(
      loadLocalAudio(
        "/audio",
        fileSystem({
          stat: async () => ({
            isFile: () => false,
            isDirectory: () => true,
          }),
        }),
      ),
    ).resolves.toEqual({ ok: false, status: "directory-not-file" });
  });

  it("distinguishes an empty or invalid local file", async () => {
    await expect(
      loadLocalAudio(
        "/empty.m4a",
        fileSystem({ readFile: async () => new Uint8Array() }),
      ),
    ).resolves.toEqual({
      ok: false,
      status: "unreadable-or-invalid-local-file",
    });
  });
});
