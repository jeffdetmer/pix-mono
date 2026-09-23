# pix-9router

Pi extension with a 9Router model provider, speech-to-text, and text-to-speech tools.

## Tools

| Tool | Default controlled by `/9router` |
|---|---|
| `transcribe` | STT model |
| `tts` | TTS model or voice, plus automatic playback |

Tool arguments override saved defaults. Tool calls never fetch the model catalog.
The `/9router` menu fetches live models or voices only when you open a setting,
then saves the choice in `~/.pi/agent/9router.json`.

## Settings

Run:

```text
/9router
```

The menu controls:

- STT model
- TTS model or voice
- TTS playback (`on` by default)

Catalogs come from `/v1/models/stt` and `/v1/models/tts`.

Web search and fetch moved to `@xynogen/pix-fetch`. Its `/search` and `/fetch`
commands include a 9Router provider that reuses `NINEROUTER_URL` and
`NINEROUTER_KEY`.

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
