# pix-themes

Theme pack for Pi Coding Agent. Bundles Pix Dark Themes.

## Themes

```text
pix-tokyo-night       # Tokyo Night Storm
pix-one-dark          # One Dark Pro
pix-catppuccin-mocha  # Catppuccin Mocha
pix-gruvbox-dark      # Gruvbox Dark
pix-dracula           # Dracula
pix-nord              # Nord
pix-rose-pine         # Rosé Pine
```

Select a theme in Pi by its name above.

## Install

```bash
pi install npm:@xynogen/pix-themes
```

> Standalone. [`@xynogen/pix-core`](https://www.npmjs.com/package/@xynogen/pix-core) does not bundle it. The [distro installer](#full-distro) installs it and sets a default theme.

## Full distro

This package is part of [Pix](https://github.com/xynogen/pix-mono). The installer sets up Pi and the full distro. See [Install](https://github.com/xynogen/pix-mono#install) for the notes for each OS.

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.sh | sh
```

```powershell
# Windows
irm https://raw.githubusercontent.com/xynogen/pix-mono/main/scripts/install.ps1 | iex
```

## License

MIT. See [LICENSE](LICENSE).
