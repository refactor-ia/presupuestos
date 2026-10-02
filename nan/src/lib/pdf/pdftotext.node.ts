/**
 * Thin adapter around the system `pdftotext` binary (INV-11 evidence).
 *
 * The benchmark toolchain is frozen (no @types/node available and no
 * dependency changes allowed), so the Node builtin is imported dynamically
 * and typed locally with the minimal surface this adapter needs. Runtime is
 * Vitest's node environment, where `node:child_process` always exists.
 *
 * PDF bytes are piped through stdin (`pdftotext - -`), so no filesystem
 * access is required. Test-only module: no application code imports this.
 */

interface SpawnSyncResult {
	error: Error | undefined;
}

interface ExecFileSyncOptions {
	input: Uint8Array;
	encoding: 'utf8';
}

type ExecFileSync = (command: string, args: string[], options: ExecFileSyncOptions) => string;
type SpawnSync = (command: string, args: string[]) => SpawnSyncResult;

// @ts-expect-error — node:child_process has no static types in this toolchain
// (no @types/node, frozen tsconfig); the cast below is the single source of
// truth for the surface used here.
const childProcess = (await import('node:child_process')) as {
	execFileSync: ExecFileSync;
	spawnSync: SpawnSync;
};

/** Whether the pdftotext binary can be spawned at all. */
export function pdftotextAvailable(): boolean {
	return childProcess.spawnSync('pdftotext', ['-v']).error === undefined;
}

/** Extract plain text from real PDF bytes; throws if extraction fails. */
export function extractTextFromPdf(bytes: Uint8Array): string {
	return childProcess.execFileSync('pdftotext', ['-', '-'], { input: bytes, encoding: 'utf8' });
}
