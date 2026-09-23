# @xynogen/pix-astgrep

AST-aware structural code search, symbol reads, and rewrites for Pi, built on
[ast-grep](https://ast-grep.github.io/). Match code by its syntax tree with
metavariables (`$A`, `$$$ARGS`) instead of text regex, read one named symbol
without loading a whole file, and rank files by identifier.

Standalone and opt-in — not bundled by `pix-core`, so the six tool schemas are
only present when you install it. Needs the `@ast-grep/napi` native addon (a
dependency, installed with the package).

## Tools

| Tool | Purpose |
|---|---|
| `ast_grep_search` | Structural search by pattern, e.g. `foo($A)` or `useState($$$)`. |
| `ast_grep_replace` | AST-aware rewrite (`pattern` → `rewrite`). Preview by default; `apply:true` writes. |
| `ast_grep_outline` | Syntax-only outline of a file or dir — declarations, imports, exports with line numbers. |
| `read_symbol` | Exact source of one named symbol (function, class, type, enum, const). |
| `read_enclosing` | Smallest named declaration that encloses a line — the reverse of `read_symbol`. |
| `symbol_search` | Rank files by how often they contain the query identifiers (AND-matched). |

## Languages

Six grammars are bundled and always work: `typescript`, `tsx`, `javascript`,
`jsx`, `css`, `html`.

`ast_grep_search` and `ast_grep_replace` also accept a `lang` for other
languages (python, go, rust, java, c, cpp, and more). The matching
`@ast-grep/lang-*` grammar installs on demand into the pix cache prefix after
your consent — it never touches a global path or this package's `node_modules`.
The outline and symbol tools support ts, tsx, js, jsx, css, and html.

## Install

```bash
pi install npm:@xynogen/pix-astgrep
```

## License

MIT
