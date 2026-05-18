const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { Pool } = require("pg");

const app = express();
const port = process.env.PORT || 3000;
const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || "https://ollama.com/v1/chat/completions";
const ollamaModel = process.env.OLLAMA_MODEL || "llama3.2";
const databaseUrl = process.env.DATABASE_URL;

const pool = databaseUrl
  ? new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl.includes("railway") || process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
    })
  : null;

const baseSystemPrompt = `You are the UR Freight 365 customer service and sales assistant. Speak for UR Freight 365 LLC in a corporate, professional, warm, and practical tone. You are not robotic, pushy, or casual. UR Freight 365 handles reefer and produce freight, steel, flatbed, OCTG, pipe, LTL, port and warehouse moves, cross-border freight, and domestic lanes. Contact information: call 346-522-2772 or email quote@urfreight365llc.com.

Your goal is to professionally qualify the customer and guide them toward calling or emailing UR Freight 365 for a confirmed quote. Ask for the details needed to qualify the shipment: freight type, commodity, origin, destination, weight, dimensions or pallet count, equipment, temperature if refrigerated, pickup date, delivery timeline, appointments, site constraints, tarps, loading method, and any special handling. Do not guarantee rates, capacity, transit times, legal advice, or compliance outcomes. If the customer is quote-ready or urgent, clearly recommend calling 346-522-2772 or emailing quote@urfreight365llc.com. Keep responses concise, specific, and helpful.`;

const contact = "For a confirmed quote, call 346-522-2772 or email quote@urfreight365llc.com.";

async function runMigrations() {
  if (!pool) {
    console.warn("DATABASE_URL is not set; chat persistence is disabled.");
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      session_id TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      customer_ip TEXT,
      page_url TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER UNIQUE NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      name TEXT,
      email TEXT,
      phone TEXT,
      company TEXT,
      freight_type TEXT,
      origin TEXT,
      destination TEXT,
      weight TEXT,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_created_at ON messages(conversation_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_captured_at ON leads(captured_at DESC);
  `);

  console.log("Database migrations complete.");
}

function sanitizeSessionId(value) {
  const sessionId = typeof value === "string" ? value.trim() : "";
  return sessionId && sessionId.length <= 120 ? sessionId : `server-${randomUUID()}`;
}

function sanitizePageUrl(value) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, 1000) || null;
}

function getCustomerIp(request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  return request.ip || request.socket?.remoteAddress || null;
}

async function getOrCreateConversation({ sessionId, customerIp, pageUrl }) {
  if (!pool) return null;

  const result = await pool.query(
    `INSERT INTO conversations (session_id, customer_ip, page_url)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id) DO UPDATE SET
       updated_at = NOW(),
       customer_ip = COALESCE(EXCLUDED.customer_ip, conversations.customer_ip),
       page_url = COALESCE(EXCLUDED.page_url, conversations.page_url)
     RETURNING *`,
    [sessionId, customerIp, pageUrl]
  );

  return result.rows[0];
}

async function saveMessage(conversationId, role, content) {
  if (!pool || !conversationId || !content) return;
  await pool.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)", [conversationId, role, content]);
  await pool.query("UPDATE conversations SET updated_at = NOW() WHERE id = $1", [conversationId]);
}

async function getRecentMessages(conversationId, limit = 10) {
  if (!pool || !conversationId) return [];
  const result = await pool.query(
    `SELECT role, content, created_at
     FROM messages
     WHERE conversation_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT $2`,
    [conversationId, limit]
  );
  return result.rows.reverse().map((message) => ({ role: message.role, content: message.content }));
}

async function getLead(conversationId) {
  if (!pool || !conversationId) return null;
  const result = await pool.query("SELECT * FROM leads WHERE conversation_id = $1", [conversationId]);
  return result.rows[0] || null;
}

function firstMatch(text, pattern) {
  const match = text.match(pattern);
  return match?.[1]?.trim().replace(/[.,;:!?]+$/, "") || null;
}

function detectFreightType(text) {
  const checks = [
    [/(reefer|refrigerated|produce|cold chain|frozen|temperature)/i, "Reefer / produce"],
    [/(steel|pipe|octg|flatbed|open deck|tarp|chains?)/i, "Steel / flatbed"],
    [/(ltl|partial|less than truckload)/i, "LTL / partial"],
    [/(port|drayage|container|warehouse)/i, "Port / warehouse"],
    [/(cross.?border|mexico|canada|border)/i, "Cross-border"],
  ];
  return checks.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function extractLeadInfo(messages) {
  const text = messages.filter((message) => message.role === "user").map((message) => message.content).join("\n");
  const compact = text.replace(/\s+/g, " ");
  const email = firstMatch(compact, /\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b/i);
  const phone = firstMatch(compact, /(?:\+?1[\s.-]?)?(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})\b/);
  const name = firstMatch(compact, /(?:my name is|this is|i am|i'm|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})(?=\s+(?:with|from|at|and|email|phone|need|looking)|[.,;]|$)/i);
  const company = firstMatch(compact, /(?:company is|from|with|at)\s+([A-Z][A-Z0-9&.,' -]{2,60})(?=\s+(?:and|we|i|email|phone|need|have|moving|shipping)|[.,;]|$)/i);
  const lane = compact.match(/(?:from|origin(?: is)?|pickup(?: in)?)\s+(.+?)\s+(?:to|into|going to|deliver(?:y)?(?: in| to)?|destination(?: is)?)\s+(.+?)(?=\s+(?:with|for|on|and|pickup|weight|call|email)|[.,;]|$)/i);
  const origin = lane?.[1]?.trim().replace(/[.,;:!?]+$/, "") || firstMatch(compact, /(?:from|origin(?: is)?|pickup(?: in)?)\s+([A-Z][A-Za-z .'-]+,?\s+[A-Z]{2}|[A-Z][A-Za-z .'-]+)(?=\s+(?:to|into|going|delivery|dest|with|for|on|and)|[.,;]|$)/i);
  const laneDestination = lane?.[2]?.trim().replace(/[.,;:!?]+$/, "") || null;
  const destination = firstMatch(compact, /(?:to|destination(?: is)?|deliver(?:y)?(?: in| to)?)\s+([A-Z][A-Za-z .'-]+,?\s+[A-Z]{2}|[A-Z][A-Za-z .'-]+)(?=\s+(?:with|for|on|and|pickup|weight)|[.,;]|$)/i);
  const weight = firstMatch(compact, /\b(\d{1,3}(?:,\d{3})*|\d+)\s*(?:lbs?|pounds?|lb|tons?)\b/i);
  const freightType = detectFreightType(compact);

  return {
    name,
    email: email && email.toLowerCase() !== "quote@urfreight365llc.com" ? email : null,
    phone,
    company,
    freight_type: freightType,
    origin,
    destination: laneDestination || destination,
    weight,
  };
}

async function upsertLead(conversationId, leadInfo) {
  if (!pool || !conversationId) return null;
  const values = [
    conversationId,
    leadInfo.name,
    leadInfo.email,
    leadInfo.phone,
    leadInfo.company,
    leadInfo.freight_type,
    leadInfo.origin,
    leadInfo.destination,
    leadInfo.weight,
  ];

  const hasAnyLeadData = values.slice(1).some(Boolean);
  if (!hasAnyLeadData) return getLead(conversationId);

  const result = await pool.query(
    `INSERT INTO leads (conversation_id, name, email, phone, company, freight_type, origin, destination, weight)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (conversation_id) DO UPDATE SET
       name = COALESCE(EXCLUDED.name, leads.name),
       email = COALESCE(EXCLUDED.email, leads.email),
       phone = COALESCE(EXCLUDED.phone, leads.phone),
       company = COALESCE(EXCLUDED.company, leads.company),
       freight_type = COALESCE(EXCLUDED.freight_type, leads.freight_type),
       origin = COALESCE(EXCLUDED.origin, leads.origin),
       destination = COALESCE(EXCLUDED.destination, leads.destination),
       weight = COALESCE(EXCLUDED.weight, leads.weight),
       captured_at = NOW()
     RETURNING *`,
    values
  );

  return result.rows[0];
}

function needsContactNudge(userExchangeCount, lead) {
  return userExchangeCount >= 3 && !(lead?.email || lead?.phone);
}

function buildSystemPrompt({ recentMessages, lead, shouldNudge }) {
  const history = recentMessages
    .map((message) => `${message.role === "user" ? "Customer" : "Assistant"}: ${message.content}`)
    .join("\n")
    .slice(-6000);
  const knownLead = lead
    ? [
        lead.name && `Name: ${lead.name}`,
        lead.email && `Email: ${lead.email}`,
        lead.phone && `Phone: ${lead.phone}`,
        lead.company && `Company: ${lead.company}`,
        lead.freight_type && `Freight type: ${lead.freight_type}`,
        lead.origin && `Origin: ${lead.origin}`,
        lead.destination && `Destination: ${lead.destination}`,
        lead.weight && `Weight: ${lead.weight}`,
      ]
        .filter(Boolean)
        .join("; ")
    : "None yet";

  return `${baseSystemPrompt}\n\nKnown lead details: ${knownLead || "None yet"}.\n${
    shouldNudge
      ? "The conversation has reached at least three customer exchanges and no email or phone is captured. Naturally ask for the customer's name and best phone or email so UR Freight 365 can follow up."
      : ""
  }\nRecent conversation history for memory/context:\n${history || "No prior messages."}`;
}

function buildFreightFallbackAnswer({ messages, lead, shouldNudge }) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const text = lastUserMessage.toLowerCase();
  const contactNudge = shouldNudge ? " Also, what is your name and the best phone or email for follow-up?" : "";

  if (/\b(rate|quote|price|cost|bid)\b/.test(text)) {
    return `I can help qualify that quote. Please share origin, destination, commodity, total weight, dimensions or pallet count, equipment type, pickup date, delivery window, and any appointment or special handling details. ${contact}${contactNudge}`;
  }

  if (/(reefer|refrigerated|produce|cold|temperature|temp|pulp|frozen)/.test(text)) {
    return `Yes. UR Freight 365 supports refrigerated and produce freight, including temperature-sensitive lanes. Please share commodity, temperature setting, pulp temperature if available, packaging, pallet count, pickup and delivery appointments, and whether the product is pre-cooled. ${contact}${contactNudge}`;
  }

  if (/(steel|pipe|flatbed|tarp|chain|strap|oversize|octg|open deck)/.test(text)) {
    return `For steel, pipe, OCTG, and flatbed freight, UR Freight 365 will need piece count, length, width, height, total weight, loading method, tarp requirements, securement needs, and site access details. ${contact}${contactNudge}`;
  }

  if (/(ltl|partial|logistics|warehouse|port|dray|cross.?border|lane|container)/.test(text)) {
    return `UR Freight 365 can help with LTL, partials, port, warehouse, cross-border, and domestic lane planning. Share origin, destination, freight type, timing, and any dock, appointment, or paperwork requirements. ${contact}${contactNudge}`;
  }

  if (lead?.freight_type || lead?.origin || lead?.destination) {
    return `Thanks — I can help qualify this further. To move toward a confirmed quote, please add any missing details: commodity, weight, dimensions or pallet count, pickup date, delivery timeline, equipment needs, and special handling. ${contact}${contactNudge}`;
  }

  return `UR Freight 365 helps with reefer and produce freight, steel and flatbed hauling, LTL, port, warehouse, cross-border, and domestic lanes. Send the shipment details you have, and I will help qualify the next step. ${contact}${contactNudge}`;
}

function normalizeInboundMessages(messages) {
  return messages
    .filter((message) => ["assistant", "user"].includes(message?.role) && typeof message?.content === "string")
    .slice(-10)
    .map((message) => ({
      role: message.role,
      content: message.content.slice(0, 2000),
    }));
}

app.use(express.json({ limit: "32kb" }));

app.post("/api/freight-assistant", async (request, response) => {
  const apiKey = process.env.Ollama_URF365 || process.env.OLLAMA_API_KEY;
  const inboundMessages = Array.isArray(request.body?.messages) ? request.body.messages : [];
  const sanitizedMessages = normalizeInboundMessages(inboundMessages);
  const latestUserMessage = [...sanitizedMessages].reverse().find((message) => message.role === "user" && message.content.trim());

  if (!latestUserMessage) {
    return response.status(400).json({ error: "A user message is required." });
  }

  const sessionId = sanitizeSessionId(request.body?.session_id || request.body?.sessionId);
  const pageUrl = sanitizePageUrl(request.body?.page_url || request.body?.pageUrl);
  const customerIp = getCustomerIp(request);

  try {
    const conversation = await getOrCreateConversation({ sessionId, customerIp, pageUrl });

    if (conversation) {
      await saveMessage(conversation.id, "user", latestUserMessage.content.trim());
    }

    const recentMessages = conversation ? await getRecentMessages(conversation.id, 10) : sanitizedMessages;
    const userExchangeCount = recentMessages.filter((message) => message.role === "user").length;
    const extractedLead = extractLeadInfo(recentMessages);
    let lead = conversation ? await upsertLead(conversation.id, extractedLead) : extractedLead;
    const shouldNudge = needsContactNudge(userExchangeCount, lead);
    const systemPrompt = buildSystemPrompt({ recentMessages, lead, shouldNudge });
    let answer;
    let source = "ollama";

    if (apiKey) {
      const abort = new AbortController();
      const ollamaTimeout = setTimeout(() => abort.abort(), 15000);
      try {
        const ollamaResponse = await fetch(ollamaEndpoint, {
          method: "POST",
          signal: abort.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: request.body?.model || ollamaModel,
            temperature: 0.35,
            max_tokens: 420,
            messages: [{ role: "system", content: systemPrompt }, ...recentMessages],
          }),
        });

        if (ollamaResponse.ok) {
          const data = await ollamaResponse.json();
          answer = data?.choices?.[0]?.message?.content?.trim();
        } else {
          const detail = await ollamaResponse.text().catch(() => "");
          console.error("Ollama API request failed", { status: ollamaResponse.status, endpoint: ollamaEndpoint, detail });
        }
      } catch (error) {
        const reason = error.name === "AbortError" ? "timeout (15 s)" : error.message;
        console.error("Ollama request failed", { endpoint: ollamaEndpoint, detail: reason });
      } finally {
        clearTimeout(ollamaTimeout);
      }
    }

    if (!answer) {
      source = "fallback";
      answer = buildFreightFallbackAnswer({ messages: recentMessages, lead, shouldNudge });
    }

    if (conversation) {
      await saveMessage(conversation.id, "assistant", answer);
      lead = await upsertLead(conversation.id, extractLeadInfo([...recentMessages, { role: "assistant", content: answer }]));
    }

    return response.json({
      answer,
      source,
      session_id: sessionId,
      conversation_id: conversation?.id || null,
      lead_captured: Boolean(lead?.email || lead?.phone || lead?.name),
    });
  } catch (error) {
    console.error("Freight assistant request failed", { detail: error.message });
    return response.json({
      answer: buildFreightFallbackAnswer({ messages: sanitizedMessages, lead: null, shouldNudge: false }),
      source: "fallback",
      session_id: sessionId,
    });
  }
});

app.get("/api/leads", async (request, response) => {
  if (!pool) return response.status(503).json({ error: "DATABASE_URL is not configured." });

  try {
    const result = await pool.query(
      `SELECT leads.*, conversations.session_id, conversations.page_url, conversations.updated_at AS conversation_updated_at
       FROM leads
       JOIN conversations ON conversations.id = leads.conversation_id
       ORDER BY leads.captured_at DESC
       LIMIT 100`
    );
    return response.json({ leads: result.rows });
  } catch (error) {
    console.error("Failed to fetch leads", { detail: error.message });
    return response.status(500).json({ error: "Failed to fetch leads." });
  }
});

app.get("/api/conversations", async (request, response) => {
  if (!pool) return response.status(503).json({ error: "DATABASE_URL is not configured." });

  try {
    const result = await pool.query(
      `SELECT c.id, c.session_id, c.created_at, c.updated_at, c.customer_ip, c.page_url,
              COUNT(m.id)::int AS message_count,
              MAX(CASE WHEN m.role = 'user' THEN m.content END) AS latest_user_message,
              l.name, l.email, l.phone, l.company, l.freight_type, l.origin, l.destination, l.weight
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       LEFT JOIN leads l ON l.conversation_id = c.id
       GROUP BY c.id, l.id
       ORDER BY c.updated_at DESC
       LIMIT 100`
    );
    return response.json({ conversations: result.rows });
  } catch (error) {
    console.error("Failed to fetch conversations", { detail: error.message });
    return response.status(500).json({ error: "Failed to fetch conversations." });
  }
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, db: Boolean(pool), model: ollamaModel });
});

app.use(express.static(__dirname, { extensions: ["html"] }));

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

runMigrations()
  .then(() => {
    app.listen(port, () => {
      console.log(`UR Freight 365 site listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database migration failed", { detail: error.message });
    process.exit(1);
  });
