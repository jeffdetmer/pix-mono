/**
 * Git recency cache — maps relative file paths to a recency score (0–1).
 * Uses `git log --name-only` to find recently touched files.
 * Cached per session, refreshed on demand.
 */

import { runGit } from "@xynogen/pix-runtime/os";

const MAX_COMMITS = 200;
const DECAY = 0.97; // exponential decay per commit position

export type RecencyMap = Map<string, number>;

export function buildRecencyScores(gitOutput: string): RecencyMap {
	const scores: RecencyMap = new Map();
	// git log --name-only output: commit header, blank, files, blank, repeat
	const files = gitOutput
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0 && !l.startsWith("commit "));

	let position = 0;
	for (const file of files) {
		if (scores.has(file)) continue; // first occurrence = most recent
		scores.set(file, DECAY ** position);
		position++;
	}
	return scores;
}

/**
 * Recency scores for files in `cwd` (empty outside a repo, on abort, or on
 * git failure). A missing git binary rejects with BinaryMissingError so the
 * caller can show the install hint once.
 */
export async function loadRecency(cwd: string, signal?: AbortSignal): Promise<RecencyMap> {
	if (signal?.aborted) return new Map();
	const stdout = await runGit(
		["log", "--name-only", "--pretty=format:", `-n${MAX_COMMITS}`, "--diff-filter=ACMR"],
		{ cwd, signal, timeoutMs: 15_000, maxBuffer: 2 * 1024 * 1024 },
	);
	return stdout ? buildRecencyScores(stdout) : new Map();
}
