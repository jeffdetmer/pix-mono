# pix-9router

Pi extension with a 9Router model provider and four tools: web fetch, web search,
speech-to-text, and text-to-speech.

## Tools

| Tool | Default controlled by `/9router` |
|---|---|
| `fetch` | Web-fetch model |
| `search` | Web-search model |
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

- Search model
- Fetch model
- STT model
- TTS model or voice
- TTS playback (`on` by default)

Catalogs come from `/v1/models/web`, `/v1/models/stt`, and `/v1/models/tts`.

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
