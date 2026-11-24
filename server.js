// Backend: serve o front-end, encaminha as análises para a API da Anthropic
// e guarda (na memória) os casos que aguardam revisão humana.
// A chave da API e a senha do analista ficam só no servidor (variáveis de ambiente).
require("dotenv").config();
const express = require("express");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const KEY = process.env.ANTHROPIC_API_KEY;
const ANALYST_PASSWORD = process.env.ANALYST_PASSWORD;
const MODEL_VISION = process.env.MODEL_VISION || "claude-sonnet-5-5";
const MODEL_CHAT = process.env.MODEL_CHAT || "claude-haiku-5-5";

if (!KEY) console.warn("Atenção: defina ANTHROPIC_API_KEY no arquivo .env");
if (!ANALYST_PASSWORD) console.warn("Atenção: defina ANALYST_PASSWORD no arquivo .env para usar o painel do analista");

app.use(express.json({ limit: "8mb" }));
app.use("/api/sample", rateLimit({ windowMs: 60_000, max: 30 }));
app.use(["/api/cases", "/api/analyst"], rateLimit({ windowMs: 60_000, max: 180 }));
app.use(express.static(path.join(__dirname, "public")));
app.get("/analista", (req, res) => res.sendFile(path.join(__dirname, "public", "analista.html")));

/* ---------- análise por IA ---------- */
app.post("/api/sample", async (req, res) => {
  try {
    const { input, images = [], tier } = req.body || {};
    if (!KEY) return res.status(500).json({ code: "no_key", error: "Chave da API não configurada" });
    if (images.length > 2) return res.status(400).json({ code: "bad_request", error: "Máximo de 2 imagens" });

    let messages;
    if (typeof input === "string") {
      const content = images.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }));
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
      body: JSON.stringify({ model: images.length ? MODEL_VISION : tier === "quick" ? MODEL_CHAT : MODEL_VISION, max_tokens: 1000, messages }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ code: r.status === 429 ? "rate_limited" : "api_error", error: data?.error?.message || "Erro na API" });
    res.json({ text: (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n") });
  } catch (e) {
    console.error(e);
    res.status(500).json({ code: "server_error", error: "Erro interno" });
  }
});

/* ---------- revisão humana ---------- */
const cases = new Map(); // somem quando o servidor reinicia (protótipo, sem banco de dados)
const MAX_CASES = 200;
const clip = (v, n) => String(v ?? "").slice(0, n);
const strList = (v) => (Array.isArray(v) ? v : []).slice(0, 10).map((a) => clip(a, 200));
const IMG = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

// O cliente (chatbot) envia um caso com alerta
app.post("/api/cases", (req, res) => {
  const { plate, items } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 12) return res.status(400).json({ error: "Itens inválidos" });
  const clean = items.map((it) => ({
    view: clip(it?.view, 60),
    image: typeof it?.image === "string" && it.image.length < 700000 && IMG.test(it.image) ? it.image : null,
    alerts: strList(it?.alerts),
    warns: strList(it?.warns),
    obs: clip(it?.obs, 300),
  }));
  const id = crypto.randomUUID();
  cases.set(id, { id, createdAt: Date.now(), plate: clip(plate, 10).toUpperCase(), status: "pendente", items: clean, decision: null });
  if (cases.size > MAX_CASES) cases.delete(cases.keys().next().value);
  res.json({ id });
});

// O cliente consulta só o status do próprio caso (o id é aleatório)
app.get("/api/cases/:id", (req, res) => {
  const c = cases.get(req.params.id);
  if (!c) return res.status(404).json({ error: "Caso não encontrado" });
  res.json({ status: c.status, note: c.decision?.note || "" });
});

function analyst(req, res, next) {
  if (!ANALYST_PASSWORD) return res.status(503).json({ error: "Defina ANALYST_PASSWORD no arquivo .env" });
  const a = Buffer.from(String(req.get("x-analyst-key") || ""));
  const b = Buffer.from(ANALYST_PASSWORD);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Senha incorreta" });
  next();
}

app.get("/api/analyst/cases", analyst, (req, res) => {
  const list = [...cases.values()].sort((x, y) => y.createdAt - x.createdAt).map((c) => ({
    id: c.id, createdAt: c.createdAt, plate: c.plate, status: c.status, alerts: c.items.reduce((n, i) => n + i.alerts.length, 0),
  }));
  res.json(list);
});

app.get("/api/analyst/cases/:id", analyst, (req, res) => {
  const c = cases.get(req.params.id);
  if (!c) return res.status(404).json({ error: "Caso não encontrado" });
  res.json(c);
});

app.post("/api/analyst/cases/:id/decision", analyst, (req, res) => {
  const c = cases.get(req.params.id);
  if (!c) return res.status(404).json({ error: "Caso não encontrado" });
  const d = req.body?.decision;
  if (!["aprovado", "reprovado"].includes(d)) return res.status(400).json({ error: "Decisão inválida" });
  if (c.status !== "pendente") return res.status(409).json({ error: "Caso já decidido" });
  c.status = d;
  c.decision = { note: clip(req.body?.note, 500), at: Date.now() };
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`AutentiCar rodando em http://localhost:${PORT} (painel do analista em /analista)`));
