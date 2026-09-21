#!/usr/bin/env bash
#
# Symlink local workspace packages into Pi's extension node_modules so edits
# in this repo are picked up instantly — no npm publish / reinstall round-trip.
#
# For packages that declare Pi resources, also patches settings.json with their
# local paths. This avoids registry lookups, so unpublished packages work too.
# Packages without Pi resources only need the symlink.
#
# Usage:
#   scripts/dev-link.sh                    # link all repo packages into Pi
#   scripts/dev-link.sh pix-bash pix-core  # link only the named package(s)
#   scripts/dev-link.sh --unlink           # restore the real npm-installed copies
#   scripts/dev-link.sh --unlink pix-bash  # restore only the named package(s)
#
# Package names match with or without the @xynogen/ scope (pix-bash == @xynogen/pix-bash).
# Linking installs the frozen workspace lockfile first, then includes each selected
# package's transitive @xynogen/* dependencies so local packages and third-party
# runtime dependencies resolve from the workspace root.
#
# After (un)linking, restart your Pi session so the extension host reloads.
#
# A `pi install` / `npm install` inside the Pi extensions dir will replace the
# symlinks with fresh npm copies; just re-run this script to relink.
set -euo pipefail

# Where Pi installs npm extensions. Override with PI_NPM_DIR if non-default.
PI_NPM_DIR="${PI_NPM_DIR:-$HOME/.pi/agent/npm}"
TARGET_DIR="${PI_NPM_DIR}/node_modules/@xynogen"
SETTINGS_FILE="${HOME}/.pi/agent/settings.json"

repo_root=$(cd "$(dirname "$0")/.." && pwd)
packages_dir="${repo_root}/packages"

mkdir -p "$TARGET_DIR"

unlink=false
[ "${1:-}" = "--unlink" ] && { unlink=true; shift; }

# Remaining args = explicit package filter (bare or @xynogen/-scoped names).
# Empty filter ($# == 0) means "all packages". A filtered link includes the
# selected packages' transitive local dependency closure.
want_pkgs=("$@")
LINK_CLOSURE=""
compute_link_closure() {
	[ ${#want_pkgs[@]} -eq 0 ] && return
	LINK_CLOSURE=$(PACKAGES_DIR="$packages_dir" node - "${want_pkgs[@]}" <<'NODE'
const fs = require("fs");
const path = require("path");
const packagesDir = process.env.PACKAGES_DIR;
const pending = process.argv.slice(2).map((name) =>
	name.startsWith("@xynogen/") ? name : `@xynogen/${name}`,
);
const seen = new Set();
while (pending.length > 0) {
	const name = pending.pop();
	if (!name || seen.has(name)) continue;
	seen.add(name);
	const packageJson = path.join(packagesDir, name.replace(/^@xynogen\//, ""), "package.json");
	if (!fs.existsSync(packageJson)) continue;
	const dependencies = JSON.parse(fs.readFileSync(packageJson, "utf8")).dependencies || {};
	for (const dependency of Object.keys(dependencies)) {
		if (dependency.startsWith("@xynogen/")) pending.push(dependency);
	}
}
process.stdout.write([...seen].join("\n"));
NODE
)
}

wants() {
	[ ${#want_pkgs[@]} -eq 0 ] && return 0
	printf '%s\n' "$LINK_CLOSURE" | grep -qx "$1"
}

linked=0
restored=0
registered=0
unregistered=0

# ── helpers ──────────────────────────────────────────────────────────────────

# Resolve pix-core's full transitive @xynogen/* dependency closure (members +
# shared libs like pix-pretty/pix-data they pull in). These are all booted in
# process by pix-core's aggregator, so none may be registered independently —
# doing so double-registers their tools/extensions and triggers Pi conflicts.
# Printed once, newline-separated, into CORE_CLOSURE.
CORE_CLOSURE=""
compute_core_closure() {
	CORE_CLOSURE=$(node -e "
const fs = require('fs');
const path = require('path');
const pkgDir = '${packages_dir}';
const readDeps = (name) => {
  const short = name.replace(/^@xynogen\//, '');
  const pj = path.join(pkgDir, short, 'package.json');
  try { return Object.keys(JSON.parse(fs.readFileSync(pj, 'utf8')).dependencies || {}); }
  catch { return []; }
};
const seen = new Set();
const stack = readDeps('@xynogen/pix-core').filter((d) => d.startsWith('@xynogen/'));
while (stack.length) {
  const d = stack.pop();
  if (seen.has(d)) continue;
  seen.add(d);
  for (const next of readDeps(d)) if (next.startsWith('@xynogen/')) stack.push(next);
}
process.stdout.write([...seen].join('\n'));
" 2>/dev/null)
}

# Returns 0 if the package is in pix-core's transitive closure.
# pix-core is always the aggregator when dev-link runs, so we don't gate on
# whether it's already in settings.json — it will be registered this run.
is_aggregated_by_core() {
	local pkg_name="$1"
	printf '%s\n' "$CORE_CLOSURE" | grep -qx "$pkg_name"
}

# Returns 0 if package.json has pi.extensions OR pi.themes (needs settings.json entry).
has_pi_extensions() {
	node -e "
const p = require('$1');
const hasExt = p.pi && Array.isArray(p.pi.extensions) && p.pi.extensions.length > 0;
const hasTheme = p.pi && (typeof p.pi.themes === 'string' || Array.isArray(p.pi.themes));
process.exit((hasExt || hasTheme) ? 0 : 1);
" 2>/dev/null
}

# Register the local package path and replace its npm source if present.
settings_add() {
	local npm_spec="npm:$1"
	local local_path="$2"
	[ -f "$SETTINGS_FILE" ] || return
	node - "$SETTINGS_FILE" "$npm_spec" "$local_path" <<'NODE'
const fs = require("fs");
const [file, npmSpec, localPath] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(settings.packages)) settings.packages = [];
let found = false;
let changed = false;
settings.packages = settings.packages.flatMap((entry) => {
  const source = typeof entry === "string" ? entry : entry?.source;
  if (source !== npmSpec && source !== localPath) return [entry];
  if (found) {
    changed = true;
    return [];
  }
  found = true;
  if (source === localPath) return [entry];
  changed = true;
  return [typeof entry === "string" ? localPath : { ...entry, source: localPath }];
});
if (!found) {
  settings.packages.push(localPath);
  changed = true;
}
if (changed) fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
process.exit(changed ? 0 : 1);
NODE
}

# Remove local and legacy npm entries from settings.json.
settings_remove() {
	local npm_spec="npm:$1"
	local local_path="$2"
	[ -f "$SETTINGS_FILE" ] || return
	node - "$SETTINGS_FILE" "$npm_spec" "$local_path" <<'NODE'
const fs = require("fs");
const [file, npmSpec, localPath] = process.argv.slice(2);
const settings = JSON.parse(fs.readFileSync(file, "utf8"));
if (!Array.isArray(settings.packages)) process.exit(1);
const before = settings.packages.length;
settings.packages = settings.packages.filter((entry) => {
  const source = typeof entry === "string" ? entry : entry?.source;
  return source !== npmSpec && source !== localPath;
});
if (settings.packages.length === before) process.exit(1);
fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
NODE
}

# ── main loop ─────────────────────────────────────────────────────────────────

# Also symlink packages into the repo's own node_modules/@xynogen so that
# Node can resolve @xynogen/* imports when traversing up from a symlink target
# (packages/<pkg>/src/). Without this, cross-package imports like
# @xynogen/pix-pretty/ansi fail at runtime because Node follows the real path
# of a symlink when walking node_modules ancestors.
REPO_NM_DIR="${repo_root}/node_modules/@xynogen"
mkdir -p "$REPO_NM_DIR"

if [ "$unlink" = false ]; then
	echo "Installing workspace dependencies from frozen lockfile..."
	(cd "$repo_root" && bun install --frozen-lockfile)
fi

compute_link_closure
compute_core_closure

for dir in "$packages_dir"/*/; do
	pkg_json="${dir}package.json"
	[ -f "$pkg_json" ] || continue

	name=$(node -p "require('${pkg_json}').name")
	wants "$name" || continue
	# Strip the @xynogen/ scope to get the dir name under @xynogen.
	short="${name#@xynogen/}"
	dest="${TARGET_DIR}/${short}"
	needs_registration=false
	has_pi_extensions "$pkg_json" && needs_registration=true

	if [ "$unlink" = true ]; then
		# Only restore entries we previously symlinked.
		if [ -L "$dest" ]; then
			rm "$dest"
			echo "↩ unlinked ${name}"
			restored=$((restored + 1))
		fi
		# Remove repo node_modules symlink too.
		[ -L "${REPO_NM_DIR}/${short}" ] && rm "${REPO_NM_DIR}/${short}"
		# Remove from settings.json if it was registered.
		if [ "$needs_registration" = true ]; then
			if settings_remove "$name" "${dir%/}"; then
				echo "  ✖ removed ${name} from settings.json"
				unregistered=$((unregistered + 1))
			fi
		fi
		continue
	fi

	# Remove the existing npm copy (or stale link) and point at the repo.
	rm -rf "$dest"
	ln -s "${dir%/}" "$dest"
	# Also symlink into repo node_modules so Node traversal resolves @xynogen/*.
	rm -rf "${REPO_NM_DIR}/${short}"
	ln -s "${dir%/}" "${REPO_NM_DIR}/${short}"
	echo "→ linked ${name} → ${dir%/}"
	linked=$((linked + 1))

	# Register in settings.json if the package has extension entries,
	# but skip packages already loaded transitively via pix-core aggregator.
	if [ "$needs_registration" = true ]; then
		if is_aggregated_by_core "$name"; then
			# A prior run may have wrongly registered this member — purge it so
			# pix-core's in-process boot is the only loader (no tool conflict).
			if settings_remove "$name" "${dir%/}"; then
				echo "  ✖ unregistered ${name} (loaded by pix-core)"
				unregistered=$((unregistered + 1))
			else
				echo "  ↷ skipped ${name} (loaded by pix-core)"
			fi
		elif settings_add "$name" "${dir%/}"; then
			echo "  ✔ registered local ${name} in settings.json"
			registered=$((registered + 1))
		fi
	fi
done

echo ""
if [ "$unlink" = true ]; then
	echo "Restored ${restored} package(s), removed ${unregistered} from settings.json."
	echo "Restart your Pi session to reload."
else
	echo "Linked ${linked} package(s), registered ${registered} new in settings.json."
	echo "Restart your Pi session to reload."
fi
