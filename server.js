const express = require("express");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || "https://ollama.com/v1/chat/completions";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";

const systemPrompt = `You are the UR Freight 365 customer service assistant. Answer as a concise, professional freight expert for UR Freight 365 LLC. Help shippers with refrigerated and reefer freight, produce transport, steel and flatbed hauling, logistics, LTL, port, warehouse, cross-border, and US domestic lane questions. Explain what details are needed for rates, including origin, destination, commodity, weight, dimensions, equipment, temperature, pickup date, delivery window, tarping, appointments, and special handling. For produce, mention temperature range, pulp temperature, packaging, pre-cooling, reefer settings, and appointment timing when relevant. For steel and flatbed, mention dimensions, weight, tarps, chains/straps, loading method, and site requirements. You may discuss general lead times and qualification questions, but do not guarantee rates, capacity, delivery times, legal advice, or regulated compliance. Encourage urgent or quote-ready loads to call 346-522-2772 or email quotes@urfreight365.com.`;

function buildFreightFallbackAnswer(messages) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const text = lastUserMessage.toLowerCase();
  const contact = "For a confirmed quote, call 346-522-2772 or email quotes@urfreight365.com.";

  if (/(rate|quote|price|cost|bid)/.test(text)) {
    return `To build a freight rate, UR Freight 365 needs origin, destination, commodity, weight, dimensions or pallet count, equipment type, pickup date, delivery window, and any appointment or special handling details. ${contact}`;
  }

  if (/(reefer|refrigerated|produce|cold|temperature|temp|pulp)/.test(text)) {
    return `Yes. UR Freight 365 supports refrigerated and produce freight. Please share commodity, temperature setting, pulp temperature if available, packaging, pallet count, pickup and delivery appointments, and whether the product is pre-cooled. ${contact}`;
  }

  if (/(steel|pipe|flatbed|tarp|chain|strap|oversize)/.test(text)) {
    return `For steel, pipe, and flatbed freight, UR Freight 365 needs piece count, length, width, height, total weight, loading method, tarp requirements, chains or straps needed, and site access details. ${contact}`;
  }

  if (/(ltl|partial|logistics|warehouse|port|dray|cross.?border|lane)/.test(text)) {
    return `UR Freight 365 can help with LTL, partials, port, warehouse, cross-border, and domestic lane planning. Share origin, destination, freight type, timing, and any dock, appointment, or paperwork requirements. ${contact}`;
  }

  return `UR Freight 365 helps with reefer and produce freight, steel and flatbed hauling, LTL, port, warehouse, cross-border, and domestic lanes. Send the shipment details you have, and the team can guide the next step. ${contact}`;
}

app.use(express.json({ limit: "32kb" }));

app.post("/api/freight-assistant", async (request, response) => {
  const apiKey = process.env.Ollama_URF365 || process.env.OLLAMA_API_KEY;

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

  if (!apiKey) {
    return response.json({
      answer: buildFreightFallbackAnswer(sanitizedMessages),
      source: "fallback",
    });
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
      console.error("Ollama API request failed", {
        status: ollamaResponse.status,
        endpoint: ollamaEndpoint,
        detail,
      });
      return response.json({
        answer: buildFreightFallbackAnswer(sanitizedMessages),
        source: "fallback",
      });
    }

    const data = await ollamaResponse.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();

    return response.json({
      answer: answer || "I could not generate a response. Please call 346-522-2772 or email quotes@urfreight365.com.",
    });
  } catch (error) {
    console.error("Freight assistant request failed", {
      endpoint: ollamaEndpoint,
      detail: error.message,
    });
    return response.json({
      answer: buildFreightFallbackAnswer(sanitizedMessages),
      source: "fallback",
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
