// Backend mínimo: serve o front-end e encaminha as análises para a API da Anthropic.
// A chave fica só no servidor (variável de ambiente), nunca no navegador.
require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL_VISION = process.env.MODEL_VISION || "claude-sonnet-5-5";
const MODEL_CHAT = process.env.MODEL_CHAT || "claude-haiku-5-5";

if (!KEY) console.warn("Atenção: defina ANTHROPIC_API_KEY no arquivo .env");

app.use(express.json({ limit: "8mb" }));
app.use("/api/", rateLimit({ windowMs: 60_000, max: 30 }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/sample", async (req, res) => {
  try {
    const { input, images = [], tier } = req.body || {};
    if (!KEY) return res.status(500).json({ code: "no_key", error: "Chave da API não configurada" });
    if (images.length > 2) return res.status(400).json({ code: "bad_request", error: "Máximo de 2 imagens" });

    let messages;
    if (typeof input === "string") {
      const content = images.map((data) => ({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data },
      }));
      content.push({ type: "text", text: input });
      messages = [{ role: "user", content }];
    } else if (Array.isArray(input)) {
      messages = input.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
    } else {
      return res.status(400).json({ code: "bad_request", error: "Entrada inválida" });
    }

    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: images.length ? MODEL_VISION : tier === "quick" ? MODEL_CHAT : MODEL_VISION,
        max_tokens: 1000,
        messages,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ code: r.status === 429 ? "rate_limited" : "api_error", error: data?.error?.message || "Erro na API" });
    const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    res.json({ text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: "server_error", error: "Erro interno" });
  }
});

app.listen(PORT, () => console.log(`AutentiCar rodando em http://localhost:${PORT}`));
