/**
 * persistence.ts — read, sparse serialize, atomic write, and a serialized
 * in-process write queue with a short-lived cross-process lock.
 *
 * A failed lock/write/rename leaves the old file intact and throws a typed
 * error; the caller keeps the previous snapshot.
 */

import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
	writeSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { RawDocument } from "./schema.ts";

export class ConfigWriteError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown,
	) {
		super(message);
		this.name = "ConfigWriteError";
	}
}

export class ConfigLockError extends ConfigWriteError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
		this.name = "ConfigLockError";
	}
}

/** The config file is not valid JSON or not a JSON object. Never overwrite it. */
export class ConfigParseError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "ConfigParseError";
	}
}

/** Filesystem adapter — tests inject an in-memory or temp-dir implementation. */
export interface StorageAdapter {
	readonly path: string;
	readRaw(): string | undefined;
	/**
	 * Read-modify-write under the cross-process lock: `fn` gets the current file
	 * text and returns the new contents (atomically written) or undefined (no
	 * write). Another process cannot write between the read and the write.
	 */
	transact(fn: (raw: string | undefined) => string | undefined): void;
	ensureDir(): void;
}

const LOCK_STALE_MS = 30_000;
const LOCK_RETRY_MS = 25;
const LOCK_MAX_RETRIES = 200; // ~5s budget

/** Node/Bun filesystem storage rooted at `<agentDir>/pix.json`. */
export class FileStorage implements StorageAdapter {
	readonly path: string;
	private readonly lockPath: string;

	constructor(agentDir: string) {
		this.path = join(agentDir, "pix.json");
		this.lockPath = `${this.path}.lock`;
	}

	ensureDir(): void {
		mkdirSync(dirname(this.path), { recursive: true });
	}

	readRaw(): string | undefined {
		try {
			if (!existsSync(this.path)) return undefined;
			return readFileSync(this.path, "utf-8");
		} catch (err) {
			throw new ConfigWriteError(`read failed: ${this.path}`, err);
		}
	}

	private acquireLock(): void {
		for (let i = 0; i < LOCK_MAX_RETRIES; i++) {
			try {
				const fd = openSync(this.lockPath, "wx", 0o600);
				writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now() }));
				closeSync(fd);
				return;
			} catch {
				// Reclaim a stale lock only when older than the threshold.
				try {
					const age = Date.now() - statSync(this.lockPath).mtimeMs;
					if (age > LOCK_STALE_MS) {
						rmSync(this.lockPath, { force: true });
						continue;
					}
				} catch {
					// Lock vanished between open and stat — retry immediately.
					continue;
				}
				Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_RETRY_MS);
			}
		}
		throw new ConfigLockError(`could not acquire ${this.lockPath}`);
	}

	private releaseLock(): void {
		try {
			rmSync(this.lockPath, { force: true });
		} catch {
			/* best effort */
		}
	}

	transact(fn: (raw: string | undefined) => string | undefined): void {
		this.ensureDir();
		this.acquireLock();
		try {
			const contents = fn(this.readRaw());
			if (contents !== undefined) this.writeAtomic(contents);
		} finally {
			this.releaseLock();
		}
	}

	/** Temp file + rename. The caller holds the lock. */
	private writeAtomic(contents: string): void {
		const tmp = `${this.path}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`;
		try {
			writeFileSync(tmp, contents, { mode: 0o600 });
			renameSync(tmp, this.path);
		} catch (err) {
			try {
				rmSync(tmp, { force: true });
			} catch {
				/* ignore */
			}
			throw new ConfigWriteError(`write failed: ${this.path}`, err);
		}
	}
}

// ── In-process serialized write queue ────────────────────────────────────────

/**
 * Serializes async transactions so concurrent updates in one process never
 * interleave reads and writes. Each task runs after the previous settles.
 */
export class WriteQueue {
	private tail: Promise<unknown> = Promise.resolve();

	run<T>(task: () => Promise<T>): Promise<T> {
		const next = this.tail.then(task, task);
		// Keep the chain alive even if a task rejects.
		this.tail = next.then(
			() => undefined,
			() => undefined,
		);
		return next;
	}
}

// ── Raw document read/parse ──────────────────────────────────────────────────

/**
 * Parse the config file. Missing or empty means `{}`. Invalid JSON or a
 * non-object throws {@link ConfigParseError}: a hand-edit typo must never be
 * read as "all defaults" and then written back over the user's file.
 */
export function parseRawDocument(text: string | undefined): RawDocument {
	if (!text?.trim()) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (err) {
		throw new ConfigParseError(`invalid JSON: ${(err as Error).message}`);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
		throw new ConfigParseError("top level is not a JSON object");
	return parsed as RawDocument;
}

export function serializeRawDocument(doc: RawDocument): string {
	return `${JSON.stringify(doc, null, 2)}\n`;
}
