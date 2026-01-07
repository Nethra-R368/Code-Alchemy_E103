import express from "express";
import cors from "cors";
import fetch from "node-fetch";

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("AI backend running");
});


app.post("/ask", async (req, res) => {
  const { question, siteMap = [] } = req.body;

  if (!question) {
    return res.json({ answer: "No question received" });
  }

  const context = siteMap
    .slice(0, 30)
    .map(l => `- ${l.text}: ${l.href}`)
    .join("\n");

  try {
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.1-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are a helpful website navigation assistant."
            },
            {
              role: "user",
              content: `Website links:\n${context}\n\nQuestion:\n${question}`
            }
          ],
          temperature: 0.3
        })
      }
    );

    const data = await groqResponse.json();

    // 🔴 DO NOT SWALLOW ERRORS
    if (!groqResponse.ok) {
      console.error("GROQ ERROR:", data);
      return res.status(500).json({
        answer: "Groq API error",
        debug: data
      });
    }

    const answer = data?.choices?.[0]?.message?.content;

    if (!answer) {
      console.error("EMPTY RESPONSE:", data);
      return res.json({ answer: "Model returned empty output" });
    }

    res.json({ answer });

  } catch (err) {
    console.error("SERVER CRASH:", err);
    res.status(500).json({ answer: "Server crashed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

