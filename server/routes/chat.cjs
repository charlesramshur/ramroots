const express = require("express");
const OpenAI  = require("openai");
const { memoryContext, rememberFacts } = require("../engine/memory.cjs");

const router = express.Router();
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL  = process.env.OPENAI_MODEL || "gpt-4o-mini";

router.post("/", async (req, res) => {
  try {
    const text = String(req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "empty_text" });

    const mem = memoryContext();
    const sys = "You are RamRoot. Be concise and helpful.";
    const user = [
      "Context:",
      JSON.stringify(mem, null, 2),
      "",
      "User:",
      text
    ].join("\n");

    const out = await client.chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: sys },
        { role: "user",   content: user }
      ]
    });

    const reply = out?.choices?.[0]?.message?.content?.trim() || "";
    if (reply) {
      rememberFacts([
        { type: "user",      value: text },
        { type: "assistant", value: reply }
      ]);
    }

    res.json({ reply, model: MODEL });
  } catch (e) {
    console.error("chat error", e);
    res.status(500).json({ error: "chat_failed", message: String(e?.message || e) });
  }
});

module.exports = router;
