/**
 * store.ts — bounded, in-memory diagnostic store for the current session.
 *
 * Keys are absolute paths. The store clones input arrays on write and returns
 * copies from list methods, so callers cannot mutate held state. It evicts the
 * least-recently-checked snapshot when it exceeds `maxFiles`. No persistence —
 * the LSP manager repopulates this state on demand.
 */

import { resolve } from "node:path";
import type { DiagnosticSnapshot } from "./types.ts";

export class DiagnosticStore {
	private readonly map = new Map<string, DiagnosticSnapshot>();
	private readonly listeners = new Set<() => void>();

	constructor(private readonly maxFiles = 500) {}

	set(snapshot: DiagnosticSnapshot): void {
		const key = resolve(snapshot.filePath);
		this.map.set(key, {
			...snapshot,
			filePath: key,
			diagnostics: [...snapshot.diagnostics],
		});
		if (this.map.size > this.maxFiles) this.evict();
		for (const listener of this.listeners) listener();
	}

	get(filePath: string): DiagnosticSnapshot | undefined {
		return this.map.get(resolve(filePath));
	}

	/** Snapshots newest-checked first, up to `limit`. */
	recent(limit = Number.POSITIVE_INFINITY): DiagnosticSnapshot[] {
		return [...this.map.values()].sort((a, b) => b.checkedAt - a.checkedAt).slice(0, limit);
	}

	all(): DiagnosticSnapshot[] {
		return [...this.map.values()];
	}

	clear(): void {
		this.map.clear();
		for (const listener of this.listeners) listener();
	}

	subscribe(listener: () => void): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	private evict(): void {
		let oldestKey: string | undefined;
		let oldestAt = Number.POSITIVE_INFINITY;
		for (const [key, snap] of this.map) {
			if (snap.checkedAt < oldestAt) {
				oldestAt = snap.checkedAt;
				oldestKey = key;
			}
		}
		if (oldestKey !== undefined) this.map.delete(oldestKey);
	}
}
