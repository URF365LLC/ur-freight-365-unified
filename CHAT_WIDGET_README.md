# UR Freight 365 AI Chat Widget

This site includes a floating customer service chat widget powered by an OpenAI-compatible Ollama endpoint through the Node/Express server.

## Files

- `chat-widget.css` — visual styling for the floating bubble and chat panel.
- `chat-widget.js` — self-contained browser widget that calls the local server endpoint.
- `server.js` — Express server that reads the API key from Railway and proxies assistant requests.
- HTML pages include the widget CSS before `</head>` and the widget script before `</body>`.

## Railway environment variable

Do not hardcode the API key in the repository. Add it to Railway instead:

1. Open the UR Freight 365 Railway project.
2. Select the deployed service.
3. Open the `Variables` tab.
4. Add a variable named `Ollama_URF365` or `OLLAMA_API_KEY`.
5. Paste the Ollama Cloud or OpenAI-compatible API key as the value.
6. Redeploy the service.

The server reads `process.env.Ollama_URF365` first, then `process.env.OLLAMA_API_KEY`, inside `server.js` and uses it as the bearer token for the freight assistant API request. The key is never sent to the browser.

Optional server configuration:

- `OLLAMA_ENDPOINT` — defaults to `https://ollama.com/v1/chat/completions`.
- `OLLAMA_MODEL` — defaults to `llama3.2`.

## Local development

Create a local `.env` file or export the variables in your shell before running the server:

```bash
export Ollama_URF365="your_api_key"
npm install
npm start
```

Then open `http://localhost:3000`.

## Widget API flow

The browser widget posts chat history to `/api/freight-assistant`. The Express server validates the message, adds the UR Freight 365 system prompt, and forwards the request to the configured Ollama/OpenAI-compatible endpoint using `process.env.Ollama_URF365` or `process.env.OLLAMA_API_KEY`.

## Model configuration

The default model is `llama3.2`. Change `OLLAMA_MODEL` in Railway or set `window.UR_FREIGHT_CHAT_CONFIG.model` on a page to use another available model.

Common Ollama model names to try, depending on what is available in the connected Ollama Cloud account:

- `llama3.2`
- `llama3.1`
- `llama3`
- `mistral`
- `qwen2.5`
- `gemma2`

Use the model name exactly as Ollama Cloud exposes it for the account. If a model returns an API error, verify the model is enabled in Ollama Cloud and update `OLLAMA_MODEL` or the page-level widget config.

## Assistant behavior

The system prompt makes the assistant focus on UR Freight 365 services:

- Refrigerated and reefer freight
- Produce logistics and handling requirements
- Steel, pipe, and flatbed hauling
- Logistics, LTL, port, warehouse, and cross-border support
- US domestic lane questions, lead times, load qualification, and quote intake

The assistant is designed to keep answers concise, avoid guarantees, and route urgent or quote-ready freight to `346-522-2772` or `quote@yourfreight365llc.com`.
