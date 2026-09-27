/**
 * store.ts — `<agentDir>/binary.json`: the user's binary choices.
 *
 * Lists every catalog entry. `null` = automatic (bin/ → PATH → download);
 * a string = the exact path the user wants. pix only writes the file to create
 * it, to add `null` for catalog entries missing from it, or to apply an edit the
 * user made in the `/pix` Binaries tab. Discovered paths are never written.
 * Keys unknown to the catalog are preserved untouched.
 */

import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomicSync } from "../atomic-write.ts";
import { agentDir, expandHome } from "../paths.ts";
import { BINARY_NAMES } from "./catalog.ts";

export const BINARY_FILE_VERSION = 1;

export type BinaryChoices = Record<string, string | null>;

export interface BinaryStoreState {
	path: string;
	choices: BinaryChoices;
	/** Parse error message when the file exists but is not valid JSON. */
	error?: string;
}

export function binaryFilePath(env: NodeJS.ProcessEnv = process.env): string {
	return join(agentDir(env), "binary.json");
}

function parseChoices(raw: unknown): BinaryChoices {
	const out: BinaryChoices = {};
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
	for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
		if (key.startsWith("$")) continue;
		if (value === null) out[key] = null;
		else if (typeof value === "string" && value.trim()) out[key] = value.trim();
	}
	return out;
}

/** Read binary.json. Missing file → empty choices; invalid JSON → empty choices + error. */
export function readBinaryStore(env: NodeJS.ProcessEnv = process.env): BinaryStoreState {
	const path = binaryFilePath(env);
	let text: string;
	try {
		text = readFileSync(path, "utf-8");
	} catch {
		return { path, choices: {} };
	}
	try {
		return { path, choices: parseChoices(JSON.parse(text)) };
	} catch (err) {
		return { path, choices: {}, error: err instanceof Error ? err.message : String(err) };
	}
}

function serialize(choices: BinaryChoices): string {
	const doc: Record<string, unknown> = { $version: BINARY_FILE_VERSION };
	for (const key of Object.keys(choices).sort()) doc[key] = choices[key] ?? null;
	return `${JSON.stringify(doc, null, 2)}\n`;
}

function writeIfChanged(path: string, choices: BinaryChoices): void {
	const next = serialize(choices);
	let current: string | undefined;
	try {
		current = readFileSync(path, "utf-8");
	} catch {
		current = undefined;
	}
	if (current !== next) {
		writeFileAtomicSync(path, next, 0o644);
		cache = undefined;
	}
}

// Lookups run on hot paths (rtk rewrites every bash command); cache the parsed
// file by path + mtime so a lookup costs one stat.
let cache: { path: string; mtimeMs: number; state: BinaryStoreState } | undefined;

/** {@link readBinaryStore}, cached until the file changes. */
export function cachedBinaryStore(env: NodeJS.ProcessEnv = process.env): BinaryStoreState {
	const path = binaryFilePath(env);
	let mtimeMs = -1;
	try {
		mtimeMs = statSync(path).mtimeMs;
	} catch {
		/* missing file */
	}
	if (cache && cache.path === path && cache.mtimeMs === mtimeMs) return cache.state;
	const state = readBinaryStore(env);
	cache = { path, mtimeMs, state };
	return state;
}

/**
 * Create binary.json or add `null` for catalog entries missing from it.
 * Never touches an invalid file (the user must fix it; the tab shows the error).
 */
export function syncBinaryStore(env: NodeJS.ProcessEnv = process.env): BinaryStoreState {
	const state = readBinaryStore(env);
	if (state.error) return state;
	const choices = { ...state.choices };
	for (const name of BINARY_NAMES) if (!(name in choices)) choices[name] = null;
	writeIfChanged(state.path, choices);
	return { path: state.path, choices };
}

/** Set (string) or clear (null) one user choice. */
export function setBinaryChoice(
	name: string,
	value: string | null,
	env: NodeJS.ProcessEnv = process.env,
): BinaryStoreState {
	const state = readBinaryStore(env);
	if (state.error)
		throw new Error(`binary.json is invalid (${state.error}); fix ${state.path} first`);
	const choices = { ...state.choices };
	for (const n of BINARY_NAMES) if (!(n in choices)) choices[n] = null;
	choices[name] = value?.trim() ? value.trim() : null;
	writeIfChanged(state.path, choices);
	return { path: state.path, choices };
}

/** A user choice with `~` expanded, or undefined for automatic. */
export function userChoice(
	state: BinaryStoreState,
	name: string,
	env = process.env,
): string | undefined {
	const raw = state.choices[name];
	return raw ? expandHome(raw, env) : undefined;
}
