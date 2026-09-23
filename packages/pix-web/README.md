# pix-web

Provider-neutral `fetch` tool for Pi. It returns plain text for model input.

Built-in providers:

- Exa through `EXA_API_KEY`
- Tavily through `TAVILY_API_KEY`
- Firecrawl through `FIRECRAWL_API_KEY`
- Jina Reader through `JINA_API_KEY` (key is optional)
- Ollama through `OLLAMA_API_KEY` and `OLLAMA_URL`
- You.com through `YDC_API_KEY`
- 9Router through `NINEROUTER_URL` and `NINEROUTER_KEY`
- `curl`, a basic HTTP provider

The model calls `fetch` with three fields only:

```ts
fetch({
  url: string,
  format?: "markdown" | "text" | "html",
  max_characters?: number,
});
```

The user picks the provider, not the model. Use `/web` to set the default
fetch provider and the 9Router fetch model. When no API provider is configured,
automatic selection uses `curl`. Other packages can register providers through
`@xynogen/pix-web/providers`.

`/web` sets the fetch and search defaults in one settings view.
The settings stay separate from `pix-9router` in `~/.pi/agent/fetch.json`:

```json
{
  "provider": "9router",
  "nineRouterModel": "exa"
}
```

Set the 9Router URL and API key in the shell environment:

```bash
export NINEROUTER_URL="https://9router.example.com/v1"
export NINEROUTER_KEY="your-api-key"
```

Replace the example URL and key with the values for your 9Router server.

```ts
import { registerFetchProvider } from "@xynogen/pix-web/providers";

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

## Web search

The same package registers a provider-neutral `search` tool. It returns web or
news results as plain text.

Built-in search providers:

- SearXNG through `SEARXNG_URL` (no API key)
- Exa through `EXA_API_KEY`
- Tavily through `TAVILY_API_KEY`
- Perplexity through `PERPLEXITY_API_KEY`
- Serper through `SERPER_API_KEY`
- Brave Search through `BRAVE_API_KEY`
- You.com through `YDC_API_KEY`
- Google PSE through `GOOGLE_PSE_API_KEY` and `GOOGLE_PSE_CX`
- SearchAPI through `SEARCHAPI_API_KEY`
- Linkup through `LINKUP_API_KEY`
- Xquik (X posts) through `XQUIK_API_KEY`
- Ollama Search through `OLLAMA_API_KEY`
- GLM (z.ai Coding plan) through `ZAI_API_KEY`
- 9Router through `NINEROUTER_URL` and `NINEROUTER_KEY`

The model calls `search` with three fields only:

```ts
search({
  query: string,
  search_type?: "web" | "news",
  max_results?: number,
});
```

The user picks the provider, not the model. Use `/web` to set the default
search provider and the 9Router search model. The 9Router provider handles its
own fallback. When no API provider is configured, automatic selection uses
SearXNG.

Search settings stay separate from fetch in `~/.pi/agent/search.json`:

```json
{
  "provider": "exa",
  "nineRouterModel": "exa"
}
```

Other packages can register search providers through
`@xynogen/pix-web/search-providers`.

Install:

```bash
pi install npm:@xynogen/pix-web
```

This package is standalone. It is not bundled by `@xynogen/pix-core`.
