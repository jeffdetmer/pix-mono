# pix-9router

Pi extension with a 9Router model provider.

Other 9Router features live in separate packages. Each one reuses
`NINEROUTER_URL` and `NINEROUTER_KEY`:

- Speech tools (`transcribe`, `speak`, `/stt`) moved to `@xynogen/pix-voice` in
  0.7.0. Pick `9router` as the provider in its `/voice` command.
- Web search and fetch live in `@xynogen/pix-web`.

## Environment

Use the upstream standard names:

```bash
export NINEROUTER_URL="https://your-router.example.com"
export NINEROUTER_KEY="your-key-here"
```

Legacy aliases remain supported:

```text
ROUTER_API_BASE
ROUTER_API_KEY
```

The standard names win when both sets exist.

## Install

```bash
pi install npm:@xynogen/pix-9router
```

This package is standalone and opt-in. It is not bundled by `@xynogen/pix-core`.

## License

MIT
