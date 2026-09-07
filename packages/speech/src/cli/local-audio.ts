import { readFile, stat } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";

export type LocalAudioFailureStatus =
  | "file-not-found"
  | "permission-denied"
  | "directory-not-file"
  | "unreadable-or-invalid-local-file";

export type LocalAudioLoadResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly bytes: Uint8Array;
        readonly fileName: string;
        readonly mediaType: string;
        readonly resolvedPath: string;
      };
    }
  | {
      readonly ok: false;
      readonly status: LocalAudioFailureStatus;
    };

interface LocalFileInfo {
  isFile(): boolean;
  isDirectory(): boolean;
}

export interface LocalAudioFileSystem {
  stat(path: string): Promise<LocalFileInfo>;
  readFile(path: string): Promise<Uint8Array>;
}

const nodeFileSystem: LocalAudioFileSystem = { stat, readFile };

/**
 * pnpm preserves the script separator for this command, producing argv shaped
 * like `[node, script, "--", audioPath]`. Select the first actual argument
 * instead of assuming index 2 is always the path.
 */
export function resolveAudioPathFromArgv(
  argv: readonly string[],
  currentWorkingDirectory: string,
): string | undefined {
  const candidate = argv
    .slice(2)
    .find((argument) => argument !== "--" && argument.trim() !== "");
  return candidate === undefined
    ? undefined
    : resolve(currentWorkingDirectory, candidate);
}

export async function loadLocalAudio(
  resolvedPath: string,
  fileSystem: LocalAudioFileSystem = nodeFileSystem,
): Promise<LocalAudioLoadResult> {
  let fileInfo: LocalFileInfo;
  try {
    fileInfo = await fileSystem.stat(resolvedPath);
  } catch (error: unknown) {
    return { ok: false, status: classifyFileSystemError(error) };
  }

  if (fileInfo.isDirectory()) {
    return { ok: false, status: "directory-not-file" };
  }
  if (!fileInfo.isFile()) {
    return { ok: false, status: "unreadable-or-invalid-local-file" };
  }

  let bytes: Uint8Array;
  try {
    bytes = await fileSystem.readFile(resolvedPath);
  } catch (error: unknown) {
    return { ok: false, status: classifyFileSystemError(error) };
  }
  if (bytes.byteLength === 0) {
    return { ok: false, status: "unreadable-or-invalid-local-file" };
  }

  return {
    ok: true,
    value: {
      bytes,
      fileName: basename(resolvedPath),
      mediaType: mediaTypeForExtension(extname(resolvedPath)),
      resolvedPath,
    },
  };
}

function classifyFileSystemError(error: unknown): LocalAudioFailureStatus {
  if (!isNodeError(error)) return "unreadable-or-invalid-local-file";
  switch (error.code) {
    case "ENOENT":
      return "file-not-found";
    case "EACCES":
    case "EPERM":
      return "permission-denied";
    case "EISDIR":
      return "directory-not-file";
    default:
      return "unreadable-or-invalid-local-file";
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function mediaTypeForExtension(extension: string): string {
  switch (extension.toLowerCase()) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
    case ".mpga":
    case ".mpeg":
      return "audio/mpeg";
    case ".mp4":
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    case ".webm":
      return "audio/webm";
    case ".flac":
      return "audio/flac";
    default:
      return "application/octet-stream";
  }
}
