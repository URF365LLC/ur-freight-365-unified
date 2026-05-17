# UR Freight 365 AI Chat Widget

This site includes a floating customer service chat widget powered by an OpenAI-compatible Ollama Cloud endpoint.

## Files

- `chat-widget.css` — visual styling for the floating bubble and chat panel.
- `chat-widget.js` — self-contained browser widget and Ollama API call logic.
- HTML pages include both files before `</head>` and `</body>`.

## Railway environment variable

Do not hardcode the API key in the repository. Add it to Railway instead:

1. Open the UR Freight 365 Railway project.
2. Select the deployed service.
3. Open the `Variables` tab.
4. Add or use the existing shared variable named `OLLAMA_URF365`.
5. Paste the Ollama Cloud API key as the value.
6. Redeploy the service.

## Injecting the API key

The widget reads the key from either a window variable or a meta tag. Your server/deploy layer should inject one of these at render time.

Recommended window variable:

```html
<script>
  window.UR_FREIGHT_CHAT_CONFIG = {
    apiKey: "${OLLAMA_URF365}",
    model: "llama3.2",
    endpoint: "https://api.ollama.com/v1/chat/completions"
  };
</script>
```

Meta tag alternative:

```html
<meta name="ollama-api-key" content="${OLLAMA_URF365}">
<meta name="ollama-model" content="llama3.2">
<meta name="ollama-endpoint" content="https://api.ollama.com/v1/chat/completions">
```

For a static site, Railway must substitute `${OLLAMA_URF365}` during build or serve the HTML through a small server/template layer. If the value is not injected, the widget still opens and shows a setup message instead of exposing a fake key.

## Model configuration

The default model is `llama3.2`, configured in `chat-widget.js` and the page-level `ollama-model` meta tag. Change the model in either place to switch models.

Common Ollama model names to try, depending on what is available in the connected Ollama Cloud account:

- `llama3.2`
- `llama3.1`
- `llama3`
- `mistral`
- `qwen2.5`
- `gemma2`

Use the model name exactly as Ollama Cloud exposes it for the account. If a model returns an API error, verify the model is enabled in Ollama Cloud and update `window.UR_FREIGHT_CHAT_CONFIG.model` or the `ollama-model` meta tag.

## Assistant behavior

The system prompt makes the assistant focus on UR Freight 365 services:

- Refrigerated and reefer freight
- Produce logistics and handling requirements
- Steel, pipe, and flatbed hauling
- Logistics, LTL, port, warehouse, and cross-border support
- US domestic lane questions, lead times, load qualification, and quote intake

The assistant is designed to keep answers concise, avoid guarantees, and route urgent or quote-ready freight to `346-522-2772` or `quotes@urfreight365.com`.
