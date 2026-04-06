import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { createServer as createViteServer } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Gemini Embedding Endpoint
  app.post("/api/embed", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      const apiKey = process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ success: false, error: "AI configuration error" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.embedContent({
        model: 'gemini-embedding-2-preview',
        contents: text,
      });

      res.json({ success: true, embedding: result.embeddings?.[0]?.values || [] });
    } catch (error) {
      console.error("Gemini Embedding Error:", error);
      res.status(500).json({ success: false, error: "Embedding failed" });
    }
  });

  // Gemini Proxy Endpoint
  app.post("/api/analyze", async (req, res) => {
    try {
      const { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      if (text.length > 200) {
        return res.status(400).json({ success: false, error: "Text too long (max 200 chars)" });
      }

      const apiKey = process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        console.error("Backend: VITE_GEMINI_API_KEY is missing");
        return res.status(500).json({ success: false, error: "AI configuration error" });
      }

      const ai = new GoogleGenAI({ apiKey });
      const trimmedText = text.trim();

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze: "${trimmedText}"`,
        config: {
          systemInstruction: `You are a Chinese language learning assistant. Analyze the sentence and return JSON:
{
  "originalText": "string",
  "translatedText": "string",
  "pinyin": "string (full sentence)",
  "educationalConfidenceScore": number (0-100, deduct for ambiguity),
  "tokens": [{"text": "string", "pinyin": "string"}],
  "breakdown": [{"word": "string", "pinyin": "string", "translation": "string", "pos": "string", "definition": "string", "context": "string"}],
  "grammar": "string (concise structure + explanation)",
  "contextUsage": "string (concise China usage)",
  "contextExamples": [{"text": "string", "pinyin": "string", "translation": "string"}]
}
Rules:
1. Tokens must match original text exactly.
2. Grammar/Context must be extremely concise.
3. Confidence < 85 if ambiguous or multiple meanings.`,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              originalText: { type: Type.STRING },
              translatedText: { type: Type.STRING },
              pinyin: { type: Type.STRING },
              educationalConfidenceScore: { type: Type.INTEGER },
              tokens: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    pinyin: { type: Type.STRING }
                  },
                  required: ["text"]
                }
              },
              breakdown: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    pinyin: { type: Type.STRING },
                    translation: { type: Type.STRING },
                    pos: { type: Type.STRING },
                    definition: { type: Type.STRING },
                    context: { type: Type.STRING }
                  },
                  required: ["word", "translation", "definition"]
                }
              },
              grammar: { type: Type.STRING },
              contextUsage: { type: Type.STRING },
              contextExamples: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    pinyin: { type: Type.STRING },
                    translation: { type: Type.STRING }
                  },
                  required: ["text", "pinyin", "translation"]
                }
              }
            },
            required: ["originalText", "translatedText", "pinyin", "tokens", "breakdown", "grammar", "contextUsage", "contextExamples", "educationalConfidenceScore"]
          }
        }
      });

      const resultText = response.text || "{}";
      const cleanJson = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const data = JSON.parse(cleanJson);

      res.json({ success: true, data });
    } catch (error) {
      console.error("Gemini Proxy Error:", error);
      res.status(500).json({ success: false, error: "AI request failed" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
