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

  const greeting = "Hi! I'm your UR Freight 365 assistant. Ask me about refrigerated transport, produce logistics, steel hauling, or a rate quote.";
  const messages = [{ role: "assistant", content: greeting }];
  const phoneNumber = "346-522-2772";
  const sessionId = getSessionId();

  function getSessionId() {
    const key = "urf365_chat_session_id";
    try {
      const existing = window.sessionStorage.getItem(key);
      if (existing) return existing;
      const created = window.crypto?.randomUUID ? window.crypto.randomUUID() : `urf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      window.sessionStorage.setItem(key, created);
      return created;
    } catch (error) {
      return `urf-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function createElement(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function addPhoneLinks(container) {
    container.innerHTML = "";
    const parts = String(container.dataset.content || "").split(phoneNumber);
    parts.forEach((part, index) => {
      if (part) container.appendChild(document.createTextNode(part));
      if (index < parts.length - 1) {
        const link = createElement("a", "urf-chat-phone-link", phoneNumber);
        link.href = `tel:${phoneNumber.replace(/-/g, "")}`;
        container.appendChild(link);
      }
    });
  }

  function renderMessage(content, role, isError) {
    const bubble = createElement("div", `urf-chat-message ${role}${isError ? " error" : ""}`);
    bubble.dataset.content = content;
    if (role === "bot" && content.includes(phoneNumber)) {
      addPhoneLinks(bubble);
    } else {
      bubble.textContent = content;
    }
    messageList.appendChild(bubble);
    messageList.scrollTop = messageList.scrollHeight;
  }

  function setBusy(isBusy) {
    input.disabled = isBusy;
    send.disabled = isBusy;
    send.textContent = isBusy ? "..." : "Send";
    status.textContent = isBusy ? "Typing..." : "Connected";
    widget.classList.toggle("is-busy", isBusy);
  }

  async function askAssistant(question) {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        session_id: sessionId,
        page_url: window.location.href,
        messages: [...messages.slice(-10), { role: "user", content: question }],
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Freight assistant request failed (${response.status}). ${detail}`.trim());
    }

    const data = await response.json();
    return data?.answer?.trim() || "I could not generate a response. Please call 346-522-2772 or email quote@urfreight365llc.com.";
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
      const fallback = "Sorry, the UR Freight 365 assistant is having trouble connecting right now. For immediate help, call 346-522-2772 or email quote@urfreight365llc.com.";
      messages.push({ role: "assistant", content: fallback });
      renderMessage(fallback, "bot", true);
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
          <p class="urf-chat-status" aria-live="polite">Connected</p>
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
      <p class="urf-chat-disclaimer">For confirmed quotes or urgent freight, call <a href="tel:+13465222772">346-522-2772</a> or email quote@urfreight365llc.com.</p>
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
  const status = widget.querySelector(".urf-chat-status");
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
