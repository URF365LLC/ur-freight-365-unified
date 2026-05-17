(function () {
  "use strict";

  if (window.URFreightChatLoaded) return;
  window.URFreightChatLoaded = true;

  const config = Object.assign(
    {
      endpoint: "/api/freight-assistant",
      model: "llama3.2",
      temperature: 0.35,
      maxTokens: 420,
    },
    window.UR_FREIGHT_CHAT_CONFIG || {}
  );

  const metaModel = document.querySelector('meta[name="ollama-model"]')?.content?.trim();
  const metaEndpoint = document.querySelector('meta[name="ollama-endpoint"]')?.content?.trim();

  config.model = metaModel || config.model;
  config.endpoint = metaEndpoint || config.endpoint;

  const systemPrompt = `You are the UR Freight 365 customer service assistant. Answer as a concise, professional freight expert for UR Freight 365 LLC. Help shippers with refrigerated and reefer freight, produce transport, steel and flatbed hauling, logistics, LTL, port, warehouse, cross-border, and US domestic lane questions. Explain what details are needed for rates, including origin, destination, commodity, weight, dimensions, equipment, temperature, pickup date, delivery window, tarping, appointments, and special handling. For produce, mention temperature range, pulp temperature, packaging, pre-cooling, reefer settings, and appointment timing when relevant. For steel and flatbed, mention dimensions, weight, tarps, chains/straps, loading method, and site requirements. You may discuss general lead times and qualification questions, but do not guarantee rates, capacity, delivery times, legal advice, or regulated compliance. Encourage urgent or quote-ready loads to call 346-522-2772 or email quotes@urfreight365.com.`;

  const greeting = "Hi! I'm your UR Freight 365 assistant. Ask me about our refrigerated transport, produce logistics, steel hauling, or get a rate quote.";
  const messages = [{ role: "assistant", content: greeting }];

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function renderMessage(content, role, isError) {
    const bubble = createElement("div", `urf-chat-message ${role}${isError ? " error" : ""}`);
    bubble.textContent = content;
    messageList.appendChild(bubble);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function setBusy(isBusy) {
    input.disabled = isBusy;
    send.disabled = isBusy;
    send.textContent = isBusy ? "..." : "Send";
  }

  async function askAssistant(question) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages: [...messages.slice(-10), { role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Freight assistant request failed (${response.status}). ${detail}`.trim());
    }

    const data = await response.json();
    return data?.answer?.trim() || "I could not generate a response. Please call 346-522-2772 or email quotes@urfreight365.com.";
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;

    input.value = "";
    messages.push({ role: "user", content: question });
    renderMessage(question, "user");
    setBusy(true);

    try {
      const answer = await askAssistant(question);
      messages.push({ role: "assistant", content: answer });
      renderMessage(answer, "bot");
    } catch (error) {
      console.error(error);
      renderMessage("Sorry, the UR Freight 365 assistant is having trouble connecting right now. For immediate help, call 346-522-2772 or email quotes@urfreight365.com.", "bot", true);
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  const widget = createElement("section", "urf-chat-widget");
  widget.setAttribute("aria-label", "UR Freight 365 chat assistant");
  widget.innerHTML = `
    <div class="urf-chat-panel" role="dialog" aria-modal="false" aria-labelledby="urf-chat-title">
      <header class="urf-chat-header">
        <div>
          <p class="urf-chat-kicker">UR Freight 365</p>
          <h2 id="urf-chat-title">Freight Assistant</h2>
          <p>Rates, lanes, produce, steel, and LTL guidance.</p>
        </div>
        <button class="urf-chat-close" type="button" aria-label="Close chat">×</button>
      </header>
      <div class="urf-chat-messages" aria-live="polite"></div>
      <div class="urf-chat-suggestions" aria-label="Suggested questions">
        <button class="urf-chat-chip" type="button">What details are needed for a rate?</button>
        <button class="urf-chat-chip" type="button">Can you handle refrigerated produce?</button>
        <button class="urf-chat-chip" type="button">What flatbed details matter?</button>
      </div>
      <form class="urf-chat-form">
        <input class="urf-chat-input" type="text" autocomplete="off" placeholder="Ask about a lane or quote..." aria-label="Chat message" />
        <button class="urf-chat-send" type="submit">Send</button>
      </form>
      <p class="urf-chat-disclaimer">For confirmed quotes or urgent freight, contact UR Freight 365 directly.</p>
    </div>
    <button class="urf-chat-launcher" type="button" aria-label="Open UR Freight 365 chat">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4.75 6.5A4.5 4.5 0 0 1 9.25 2h5.5a4.5 4.5 0 0 1 4.5 4.5v4.75a4.5 4.5 0 0 1-4.5 4.5h-2.7l-4.25 3.4a.85.85 0 0 1-1.38-.66v-2.74A4.5 4.5 0 0 1 4.75 11.25V6.5Z" stroke="currentColor" stroke-width="1.8"/><path d="M8.2 8h7.6M8.2 11.2h4.9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
  `;

  document.body.appendChild(widget);

  const launcher = widget.querySelector(".urf-chat-launcher");
  const close = widget.querySelector(".urf-chat-close");
  const form = widget.querySelector(".urf-chat-form");
  const input = widget.querySelector(".urf-chat-input");
  const send = widget.querySelector(".urf-chat-send");
  const messageList = widget.querySelector(".urf-chat-messages");

  renderMessage(greeting, "bot");

  launcher.addEventListener("click", () => {
    widget.classList.toggle("is-open");
    launcher.setAttribute("aria-label", widget.classList.contains("is-open") ? "Close UR Freight 365 chat" : "Open UR Freight 365 chat");
    if (widget.classList.contains("is-open")) setTimeout(() => input.focus(), 100);
  });

  close.addEventListener("click", () => widget.classList.remove("is-open"));
  form.addEventListener("submit", handleSubmit);
  widget.querySelectorAll(".urf-chat-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = chip.textContent.trim();
      input.focus();
    });
  });
})();
