import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();

/* ---------- MIDDLEWARE ---------- */
app.use(cors({
  origin: "*",
  methods: ["POST", "GET"],
  allowedHeaders: ["Content-Type"]
}));
app.use(express.json());

/* ---------- HEALTH CHECK ---------- */
app.get("/", (req, res) => {
  res.send("✅ AI Guide backend is running");
});

/* ---------- MAIN ASK ROUTE ---------- */
app.post("/ask", async (req, res) => {
  try {
    const { question, siteMap = [], url = "" } = req.body;

    if (!question) {
      return res.json({ answer: "No question provided." });
    }

    // Build readable link context
    const links =
      siteMap.length > 0
        ? siteMap.map(l => `- ${l.text}: ${l.href}`).join("\n")
        : "(No links found on page)";

    const prompt = `
You are a website navigation assistant.

Website URL:
${url}

Available links:
${links}

User question:
${question}

Give clear step-by-step instructions using the links.
`;

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": \`Bearer ${process.env.GROQ_API_KEY}\`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2
        })
      }
    );

    const data = await groqRes.json();

    // 🔴 EXPLICIT ERROR VISIBILITY
    if (!groqRes.ok) {
      console.error("❌ GROQ ERROR:", data);
      return res.status(500).json({
        answer: "Groq API error",
        debug: data
      });
    }

    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      console.error("❌ EMPTY GROQ RESPONSE:", data);
      return res.json({
        answer: "Groq returned empty response",
        debug: data
      });
    }

    res.json({ answer });

  } catch (err) {
    console.error("❌ SERVER ERROR:", err);
    res.status(500).json({ answer: "Server crashed." });
  }
});

/* ---------- START SERVER ---------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on port", PORT);
});
