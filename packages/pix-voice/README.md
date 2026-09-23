# pix-voice

Provider-neutral speech tools for Pi: `transcribe` (speech to text), `tts`
(text to speech), and the `/stt` microphone command.

## Tools

The model calls the tools with these fields:

```ts
transcribe({ file: string, output_file?: string, model?: string, language?: string });
tts({ input: string, model?: string, output_file?: string, response_format?: "mp3" | "wav" | "opus" | "aac" | "flac", play?: boolean });
```

The user picks the provider, not the model. A tool call uses the provider set in
`/voice`. The `model` argument overrides only the model or voice of that
provider. Every result names the provider and model that ran. There is no
silent fallback to another provider.

For most TTS providers, a model is `model/voice`, for example
`gpt-4o-mini-tts/nova`. Some providers return `wav` or `mp3` for every request.
The tool names the saved file by the real format and reports a mismatch.

## Providers

The set follows the direct adapters in 9Router.

| Provider | STT | TTS | Environment |
|---|---|---|---|
| `9router` | yes | yes | `NINEROUTER_URL`, `NINEROUTER_KEY` |
| `openai` | yes | yes | `OPENAI_API_KEY` |
| `groq` | yes | | `GROQ_API_KEY` |
| `deepgram` | yes | | `DEEPGRAM_API_KEY` |
| `assemblyai` | yes | | `ASSEMBLYAI_API_KEY` |
| `gemini` | yes | yes | `GEMINI_API_KEY` |
| `huggingface` | yes | | `HF_TOKEN` |
| `nvidia` | yes | yes | `NVIDIA_API_KEY` |
| `elevenlabs` | | yes | `ELEVENLABS_API_KEY` |
| `minimax`, `minimax-cn` | | yes | `MINIMAX_API_KEY`, `MINIMAX_CN_API_KEY` |
| `fish-audio` | | yes | `FISH_AUDIO_API_KEY` |
| `cartesia` | | yes | `CARTESIA_API_KEY` |
| `inworld` | | yes | `INWORLD_API_KEY` |
| `openrouter` | | yes | `OPENROUTER_API_KEY` |
| `xiaomi-mimo` | | yes | `XIAOMI_API_KEY` |
| `selfhosted` | yes | yes | `SELFHOSTED_STT_URL`, `SELFHOSTED_TTS_URL`, `SELFHOSTED_API_KEY` (optional) |

`auto` uses the first configured provider in the table order. The `9router`
provider also reaches the providers that are not direct adapters here, for
example `edge-tts`, `google-tts`, and `aws-polly`.

## Settings

Run `/voice` to set the STT and TTS provider, the model or voice for each
provider, and TTS playback. A model list loads only when you open the model
picker. Settings stay in `~/.pi/agent/voice.json`:

```json
{
  "sttProvider": "groq",
  "ttsProvider": "9router",
  "sttModels": { "groq": "whisper-large-v3-turbo" },
  "ttsModels": { "9router": "edge-tts/en-US-AriaNeural" },
  "ttsPlay": true,
  "sttDevice": "default"
}
```

When `voice.json` does not exist, the first load copies the audio defaults from
the old `~/.pi/agent/9router.json`.

## Microphone

`/stt` records from a PulseAudio source through `ffmpeg`. It then puts the
transcript in the prompt editor. It needs `ffmpeg` on `PATH`, and `pactl` to
list input devices. Playback after `tts` uses `pw-play`, `paplay`, `ffplay`, or
`mpv`.

## Custom providers

```ts
import { registerProvider } from "@xynogen/pix-voice/providers";

registerProvider("stt", {
  id: "example",
  defaultModel: "example-1",
  env: ["EXAMPLE_API_KEY"],
  isConfigured: () => Boolean(process.env.EXAMPLE_API_KEY),
  transcribe: async ({ file, model, language, signal }) => "transcript",
});
```

## Install

```bash
pi install npm:@xynogen/pix-voice
```

This package is standalone and opt-in. It is not bundled by `@xynogen/pix-core`.

## License

MIT
