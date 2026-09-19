/**
 * dispositions.ts — a visible, auditable store of diagnostic dispositions.
 *
 * The agent marks a finding as a false-positive, suppresses it, defers it for
 * the session, or flags it to fix. This is session memory: it is explicit,
 * listable, and clearable. No persistence — a new session starts empty.
 */

export type Disposition = "false-positive" | "suppress" | "defer" | "flagged";

export interface DispositionRecord {
	filePath: string;
	code: string;
	disposition: Disposition;
	note?: string;
	markedAt: number;
}

export class DispositionStore {
	private readonly map = new Map<string, DispositionRecord>();

	constructor(private readonly now: () => number = Date.now) {}

	private key(filePath: string, code: string): string {
		return `${filePath}::${code}`;
	}

	set(filePath: string, code: string, disposition: Disposition, note?: string): DispositionRecord {
		const record: DispositionRecord = {
			filePath,
			code,
			disposition,
			note,
			markedAt: this.now(),
		};
		this.map.set(this.key(filePath, code), record);
		return record;
	}

	get(filePath: string, code: string): DispositionRecord | undefined {
		return this.map.get(this.key(filePath, code));
	}

	list(): DispositionRecord[] {
		return [...this.map.values()].sort((a, b) => b.markedAt - a.markedAt);
	}

	delete(filePath: string, code: string): boolean {
		return this.map.delete(this.key(filePath, code));
	}

	clear(): void {
		this.map.clear();
	}
}
