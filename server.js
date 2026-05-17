const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || "https://api.ollama.com/v1/chat/completions";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

const systemPrompt = `You are the UR Freight 365 customer service assistant. Answer as a concise, professional freight expert for UR Freight 365 LLC. Help shippers with refrigerated and reefer freight, produce transport, steel and flatbed hauling, logistics, LTL, port, warehouse, cross-border, and US domestic lane questions. Explain what details are needed for rates, including origin, destination, commodity, weight, dimensions, equipment, temperature, pickup date, delivery window, tarping, appointments, and special handling. For produce, mention temperature range, pulp temperature, packaging, pre-cooling, reefer settings, and appointment timing when relevant. For steel and flatbed, mention dimensions, weight, tarps, chains/straps, loading method, and site requirements. You may discuss general lead times and qualification questions, but do not guarantee rates, capacity, delivery times, legal advice, or regulated compliance. Encourage urgent or quote-ready loads to call 346-522-2772 or email quotes@urfreight365.com.`;

app.use(express.json({ limit: "32kb" }));

app.post("/api/freight-assistant", async (request, response) => {
  const apiKey = process.env.Ollama_URF365;

  if (!apiKey) {
    return response.status(500).json({
      error: "Freight assistant API key is not configured.",
    });
  }

  const messages = Array.isArray(request.body?.messages) ? request.body.messages : [];
  const sanitizedMessages = messages
    .filter((message) => ["assistant", "user"].includes(message?.role) && typeof message?.content === "string")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    }));

  if (!sanitizedMessages.some((message) => message.role === "user" && message.content.trim())) {
    return response.status(400).json({ error: "A user message is required." });
  }

  try {
    const ollamaResponse = await fetch(ollamaEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.body?.model || ollamaModel,
        temperature: 0.35,
        max_tokens: 420,
        messages: [{ role: "system", content: systemPrompt }, ...sanitizedMessages],
      }),
    });

    if (!ollamaResponse.ok) {
      const detail = await ollamaResponse.text().catch(() => "");
      return response.status(ollamaResponse.status).json({
        error: "Ollama API request failed.",
        detail,
      });
    }

    const data = await ollamaResponse.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();

    return response.json({
      answer: answer || "I could not generate a response. Please call 346-522-2772 or email quotes@urfreight365.com.",
    });
  } catch (error) {
    return response.status(502).json({
      error: "Freight assistant request failed.",
      detail: error.message,
    });
  }
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`UR Freight 365 site listening on port ${port}`);
});
