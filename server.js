import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

app.use(cors());
app.use(express.json());

app.post("/ask", async (req, res) => {
  const { question, siteMap, url } = req.body;

  if (!question) return res.json({ answer: "Ask something." });

  const links = (siteMap || [])
    .map(l => `- ${l.text}: ${l.href}`)
    .join("\n");

  const prompt = `
You are a website navigation assistant.

Website URL: ${url}

Available links:
${links}

User question:
${question}

Answer with clear steps and links.
`;

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1
      })
    });

    const data = await groqRes.json();
    res.json({ answer: data.choices?.[0]?.message?.content || "No answer." });
  } catch (e) {
    res.status(500).json({ answer: "AI server error." });
  }
});

app.listen(PORT, () => console.log("✅ AI backend running"));
