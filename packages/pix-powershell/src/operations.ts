/**
 * Shell operations for the `powershell` tool, wrapping Pi's local PowerShell
 * operations with two fixes:
 *
 *  1. Plain-text formatting. PowerShell 7.2+ colors table headers/errors via
 *     `$PSStyle` even when stdout is a pipe; those ANSI codes waste tokens and
 *     clutter the transcript. Windows PowerShell 5.1 has no `$PSStyle`, so the
 *     preamble is guarded.
 *  2. Chain operators on Windows PowerShell 5.1. `&&` / `||` exist only in
 *     PowerShell 7+. When Pi falls back to `powershell.exe`, top-level chains
 *     are rewritten to equivalent `$?` checks, and the rewrite is reported in
 *     the tool output so it stays visible.
 */

export interface ShellExecOptions {
	onData: (data: Buffer) => void;
	signal?: AbortSignal;
	timeout?: number;
	env?: NodeJS.ProcessEnv;
}

export interface ShellOperations {
	exec(
		command: string,
		cwd: string,
		options: ShellExecOptions,
	): Promise<{ exitCode: number | null }>;
}

/** Guarded: `$PSStyle` exists only in PowerShell 7.2+. */
export const PLAIN_TEXT_PREAMBLE = "if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }\n";

export const LEGACY_REWRITE_NOTE =
	"[pix-powershell] Windows PowerShell 5.1: rewrote && / || as $? checks\n";

type Separator = "&&" | "||" | ";" | "\n";
interface Piece {
	text: string;
	/** Separator that FOLLOWS this piece (undefined for the last piece). */
	sep?: Separator;
}

/**
 * Split `command` at top-level `&&`, `||`, `;`, and newlines. Anything inside
 * quotes, here-strings, comments, or ( [ { nesting is left intact.
 * Returns undefined when the script is not safely parseable (unterminated
 * string/comment), so the caller runs it unchanged.
 */
function splitTopLevel(command: string): Piece[] | undefined {
	const pieces: Piece[] = [];
	let depth = 0;
	let start = 0;
	let i = 0;
	const n = command.length;
	const push = (end: number, sep: Separator | undefined, next: number) => {
		pieces.push({ text: command.slice(start, end), sep });
		start = next;
		i = next;
	};

	while (i < n) {
		const c = command[i];
		const next = command[i + 1];

		// Backtick escapes the next char (incl. line continuation).
		if (c === "`") {
			i += 2;
			continue;
		}
		// Here-strings: @' / @" followed by a newline, closed by '@ / "@ at line start.
		if (c === "@" && (next === "'" || next === '"') && /^\r?\n/.test(command.slice(i + 2))) {
			const close = command.indexOf(`\n${next}@`, i + 2);
			if (close < 0) return undefined;
			i = close + 3;
			continue;
		}
		if (c === "'") {
			// '' is an escaped quote inside a single-quoted string.
			let j = i + 1;
			for (;;) {
				const k = command.indexOf("'", j);
				if (k < 0) return undefined;
				if (command[k + 1] === "'") {
					j = k + 2;
					continue;
				}
				i = k + 1;
				break;
			}
			continue;
		}
		if (c === '"') {
			let j = i + 1;
			while (j < n && command[j] !== '"') j += command[j] === "`" ? 2 : 1;
			if (j >= n) return undefined;
			i = j + 1;
			continue;
		}
		if (c === "<" && next === "#") {
			const close = command.indexOf("#>", i + 2);
			if (close < 0) return undefined;
			i = close + 2;
			continue;
		}
		if (c === "#" && (i === 0 || /[\s;(){}|&]/.test(command[i - 1] ?? ""))) {
			const nl = command.indexOf("\n", i);
			i = nl < 0 ? n : nl;
			continue;
		}
		if (c === "(" || c === "[" || c === "{") {
			depth++;
			i++;
			continue;
		}
		if (c === ")" || c === "]" || c === "}") {
			depth = Math.max(0, depth - 1);
			i++;
			continue;
		}
		if (depth === 0) {
			if ((c === "&" && next === "&") || (c === "|" && next === "|")) {
				// Chain operators allow the next pipeline on the following line.
				let j = i + 2;
				while (j < n && /\s/.test(command[j] ?? "")) j++;
				push(i, c === "&" ? "&&" : "||", j);
				continue;
			}
			if (c === ";" || c === "\n") {
				push(i, c, i + 1);
				continue;
			}
		}
		i++;
	}
	pieces.push({ text: command.slice(start) });
	return pieces;
}

const OK = "$__pixOk";

/**
 * Rewrite PowerShell 7 pipeline-chain operators for Windows PowerShell 5.1.
 * `a && b || c` → `a; $__pixOk = $?; if ($__pixOk) { b; $__pixOk = $? };
 * if (-not $__pixOk) { c; $__pixOk = $? }` (left-associative, like pwsh 7).
 * A chain that ends the script also propagates failure as the exit code.
 * Returns undefined when there is nothing to rewrite.
 */
export function rewriteChainOperators(command: string): string | undefined {
	const pieces = splitTopLevel(command);
	if (!pieces?.some((p) => p.sep === "&&" || p.sep === "||")) return undefined;

	let lastContentIndex = -1;
	pieces.forEach((p, index) => {
		if (p.text.trim() !== "") lastContentIndex = index;
	});
	const out: string[] = [];
	let chain: { text: string; op?: "&&" | "||" }[] = [];
	let pendingOp: "&&" | "||" | undefined;

	const flush = (endsScript: boolean): void => {
		const [first, ...rest] = chain;
		chain = [];
		if (!first) return;
		if (rest.length === 0) {
			out.push(first.text);
			return;
		}
		let s = `${first.text.trim()}; ${OK} = $?`;
		for (const seg of rest) {
			const cond = seg.op === "&&" ? OK : `-not ${OK}`;
			s += `; if (${cond}) { ${seg.text.trim()}; ${OK} = $? }`;
		}
		if (endsScript) {
			s += `; if (-not ${OK}) { exit $(if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }) }`;
		}
		out.push(s);
	};

	pieces.forEach((piece, index) => {
		chain.push({ text: piece.text, op: pendingOp });
		pendingOp = undefined;
		if (piece.sep === "&&" || piece.sep === "||") {
			pendingOp = piece.sep;
			return;
		}
		flush(index >= lastContentIndex);
		if (piece.sep) out.push(piece.sep);
	});
	if (chain.length > 0) flush(true);
	return out.join("");
}

/** True when the resolved PowerShell executable is Windows PowerShell 5.1. */
export function isWindowsPowerShell(shellPath: string): boolean {
	return /(?:^|[\\/])powershell(?:\.exe)?$/i.test(shellPath);
}

export function createPixPowerShellOperations(
	inner: ShellOperations,
	resolveShellPath: () => string | undefined,
): ShellOperations {
	let legacy: boolean | undefined;
	return {
		exec(command, cwd, options) {
			if (legacy === undefined) {
				try {
					legacy = isWindowsPowerShell(resolveShellPath() ?? "");
				} catch {
					legacy = false; // inner.exec reports the missing-shell error
				}
			}
			let script = command;
			if (legacy) {
				const rewritten = rewriteChainOperators(command);
				if (rewritten !== undefined) {
					script = rewritten;
					options.onData(Buffer.from(LEGACY_REWRITE_NOTE));
				}
			}
			return inner.exec(`${PLAIN_TEXT_PREAMBLE}${script}`, cwd, options);
		},
	};
}
