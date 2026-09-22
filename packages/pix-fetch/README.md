# pix-fetch

Provider-neutral `fetch` tool for Pi. It returns plain text for model input.

Built-in providers:

- Exa through `EXA_API_KEY`
- Tavily through `TAVILY_API_KEY`
- 9Router through `NINEROUTER_URL` and `NINEROUTER_KEY`
- `curl`, a basic HTTP provider

Other packages can register providers through `@xynogen/pix-fetch/providers`.
Tool calls can select one provider and an ordered fallback list.
When no API provider is configured, automatic selection uses `curl`.
Provider-specific values pass through `provider_options`.
Common request fields always override conflicting provider options.

Use `/fetch` to set the package's default provider and 9Router fetch model.
The settings stay separate from `pix-9router` in `~/.pi/agent/fetch.json`.
Provider URL and API keys stay in environment variables.

```ts
import { registerFetchProvider } from "@xynogen/pix-fetch/providers";

registerFetchProvider({
  id: "example",
  isConfigured: () => Boolean(process.env.EXAMPLE_API_KEY),
  fetch: async ({ url }) => ({
    url,
    content: "Example page text",
  }),
});
```

The public adapter contract uses normalized responses:

```ts
interface FetchProvider {
  id: string;
  isConfigured?: () => boolean;
  fetch: (request: FetchRequest) => Promise<FetchResponse>;
}
```

A tool call can request fallback without hiding the order:

```json
{
  "url": "https://example.com",
  "provider": "exa",
  "fallback_providers": ["tavily", "curl"]
}
```

Install:

```bash
pi install npm:@xynogen/pix-fetch
```

This package is standalone. It is not bundled by `@xynogen/pix-core`.
