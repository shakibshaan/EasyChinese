import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import cors from "cors";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // ==============================
  // ✅ Create Gemini client ONCE
  // ==============================
  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;

  if (!apiKey) {
    console.warn("GEMINI_API_KEY is missing. API calls will fail.");
  }

  const ai = new GoogleGenAI({ apiKey: apiKey || "dummy-key" });

  // ==============================
  // SYSTEM PROMPT
  // ==============================
  const SYSTEM_PROMPT = `You are a Chinese language learning assistant. Analyze the sentence and return JSON:

{
  "originalText": "string",
  "translatedText": "string",
  "pinyin": "string",
  "educationalConfidenceScore": number,
  "tokens": [{"text":"string","pinyin":"string"}],
  "breakdown":[{"word":"string","pinyin":"string","translation":"string","pos":"string","definition":"string","context":"string"}],
  "grammar":"string",
  "contextUsage":"string",
  "contextExamples":[{"text":"string","translation":"string","tokens":[{"text":"string","pinyin":"string"}]}]
}

Rules:
1. English input → translate to Chinese.
2. Tokens must match Chinese text exactly.
3. Grammar/context concise.
4. Generate exactly 2 examples.
5. Confidence <85 if ambiguous.`;

  // ==============================
  // ANALYZE ENDPOINT (Gemini)
  // ==============================
  app.post("/api/analyze", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({
          success: false,
          error: "Text is required",
        });
      }

      if (text.length > 200) {
        return res.status(400).json({
          success: false,
          error: "Text too long (max 200 chars)",
        });
      }

      const trimmedText = text.trim();

      // ==============================
      // ✅ Gemini Call
      // ==============================
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: [
          {
            role: "user",
            parts: [{ text: trimmedText }],
          },
        ],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.1,
          responseMimeType: "application/json",
          maxOutputTokens: 800,
        },
      });

      const raw = response.text || "{}";
      console.log("Raw Gemini response:", raw);

      const cleanJson = raw
        .replace(/^```json\n?/, "")
        .replace(/\n?```$/, "")
        .trim();

      let data;
      try {
        data = JSON.parse(cleanJson);
      } catch (err) {
        console.error("Invalid JSON:", raw);
        return res.status(500).json({
          success: false,
          error: "AI returned invalid JSON",
        });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Gemini Error:", error);

      res.status(500).json({
        success: false,
        error: "AI request failed",
        details: error.message,
      });
    }
  });

  // ==============================
  // VITE DEV / PROD
  // ==============================
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();