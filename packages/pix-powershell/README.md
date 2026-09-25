# pix-powershell

Pi tool — PowerShell execution with pretty output.

## What it does

Renders Pi's optional built-in `powershell` tool the same way [`pix-bash`](https://www.npmjs.com/package/@xynogen/pix-bash) renders `bash`: a compact call line, a full-width status-colored framed output block, a live five-line tail while the command runs, and an auto-collapsed one-line summary such as `✓ powershell Get-ChildItem -Force · 42 lines · 1.2s`. Execution is unchanged — it wraps Pi's own `createPowerShellToolDefinition` (`pwsh.exe`, falling back to Windows PowerShell).

## Output and compatibility fixes

- **Plain-text output.** PowerShell 7.2+ adds ANSI colour to table headers and errors even when output is piped, which wastes tokens and clutters the transcript. Every command starts with `if ($PSStyle) { $PSStyle.OutputRendering = 'PlainText' }`. Windows PowerShell 5.1 has no `$PSStyle`, so the line is a no-op there.
- **`&&` / `||` on Windows PowerShell 5.1.** Pi falls back to `powershell.exe` when `pwsh.exe` isn't on PATH, and 5.1 rejects chain operators. On 5.1 only, top-level chains are rewritten to `$?` checks (`a && b` → `a; $__pixOk = $?; if ($__pixOk) { b; … }`), and a failed chain at the end of the script still exits non-zero. Operators inside strings, comments, here-strings, and `( [ {` blocks are left alone. Whenever a rewrite happens, the output starts with a visible `[pix-powershell] … rewrote && / ||` line.

## Opt-in by design

Pi exposes `powershell` only on native Windows, and only when you enable it. pix-powershell never enables it for you:

- On non-Windows platforms it does nothing.
- On Windows it waits for session start and overrides the renderer **only if `powershell` is already an active tool**. Otherwise it registers nothing, so no extra tool schema reaches the model.

Enable the tool in `~/.pi/agent/settings.json` (see Pi's `docs/windows.md`):

```json
{
  "defaultTools": ["read", "bash", "powershell", "edit", "write"]
}
```

Or for one run: `pi --tools read,bash,powershell,edit,write`.

## Auto-collapse

Uses the shared `collapse` section of `~/.pi/agent/pix.json`. Disable for this tool only with:

```jsonc
{ "collapse": { "tools": { "powershell": false } } }
```

## Install

```bash
pi install npm:@xynogen/pix-powershell
```

> Also included in [`@xynogen/pix-core`](https://www.npmjs.com/package/@xynogen/pix-core).

## Full distro

Source: [github.com/xynogen/pix-mono](https://github.com/xynogen/pix-mono)
