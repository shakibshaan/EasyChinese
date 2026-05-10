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

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
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
3. Confidence < 85 if ambiguous or multiple meanings.
4. You MUST provide exactly two items in contextExamples.`,
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
      } catch (error) {
        console.warn("Primary model (gemini-3.1-flash-lite-preview) failed, falling back to gemini-2.0-flash:", error);
        response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
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
3. Confidence < 85 if ambiguous or multiple meanings.
4. You MUST provide exactly two items in contextExamples.`,
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
      }

      const resultText = response.text || "{}";
      const cleanJson = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
      const data = JSON.parse(cleanJson);

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Gemini Proxy Error:", error);
      
      let errorDetails = "Unknown error";
      if (error?.message) {
        errorDetails = error.message;
      } else if (typeof error === 'string') {
        errorDetails = error;
      } else {
        try {
          errorDetails = JSON.stringify(error);
        } catch (e) {
          errorDetails = String(error);
        }
      }

      res.status(500).json({ 
        success: false, 
        error: "AI request failed",
        details: errorDetails
      });
    }
  });

  // Scenario Endpoint
  app.post("/api/scenario/stream", async (req, res) => {
    try {
      const { scenario, isContinuation, previousSentences } = req.body;

      if (!scenario || typeof scenario !== 'string') {
        return res.status(400).json({ success: false, error: "Scenario is required" });
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const apiKey = process.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        res.write(`data: {"error": "AI configuration error"}\n\n`);
        return res.end();
      }

      const ai = new GoogleGenAI({ apiKey });
      const trimmedScenario = scenario.trim();

      let instruction = `You are a Chinese language learning assistant. Generate a realistic timeline of sentences for a given scenario.
CRITICAL: Do NOT use formal "textbook" Chinese. Use highly authentic, natural, colloquial, and "local" spoken Chinese exactly as native speakers say it in real life (e.g., using natural phrasing, common local idioms, or colloquial sentence structures).
Output exactly this JSON structure:
{
  "scenarioTitle": "string (Short descriptive title of the scenario)",
  "sentences": [
    {
      "originalText": "string (Natural, authentic, spoken Chinese text)",
      "translatedText": "string (English translation)",
      "pinyin": "string (Full pinyin)",
      "tokens": [{"text": "string (Chinese character/word)", "pinyin": "string (pinyin for this word)"}],
      "breakdown": [
        {
          "word": "string (the Chinese word)",
          "pinyin": "string (pinyin for this word)",
          "translation": "string (English translation)",
          "definition": "string (brief definition)",
          "pos": "string (part of speech, optional)"
        }
      ]
    }
  ]
}
Rules:
1. Provide around 4-6 sequential sentences relating to the event.
2. Tokens must match originalText exactly when combined.
3. Language MUST be authentic, casual, and local everyday spoken Chinese, avoiding rigid or overly formal textbook phrases.
4. Provide a word-by-word breakdown for important words in the sentence.`;

      let contents = `Scenario: "${trimmedScenario}"`;
      if (isContinuation && previousSentences) {
        instruction += `\n\nThis is a continuation of a scenario. Here are the previous sentences:\n${JSON.stringify(previousSentences)}. \n\nProvide 3 or 4 MORE sentences that logically follow the previous ones.`;
        contents = `Scenario: "${trimmedScenario}"\nProvide 3 or 4 MORE sentences that logically follow the previous ones.`;
      }

      const getScenarioConfig = (modelName: string): any => ({
        model: modelName,
        contents,
        config: {
          systemInstruction: instruction,
          temperature: 0.7,
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              scenarioTitle: { type: Type.STRING },
              sentences: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    originalText: { type: Type.STRING },
                    translatedText: { type: Type.STRING },
                    pinyin: { type: Type.STRING },
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
                          definition: { type: Type.STRING },
                          pos: { type: Type.STRING }
                        },
                        required: ["word", "translation", "definition"]
                      }
                    }
                  },
                  required: ["originalText", "translatedText", "pinyin", "tokens", "breakdown"]
                }
              }
            },
            required: ["scenarioTitle", "sentences"]
          }
        }
      });

      let resultStream;
      try {
        resultStream = await ai.models.generateContentStream(getScenarioConfig("gemini-2.5-flash"));
      } catch (error) {
        console.warn("Primary model failed, falling back:", error);
        resultStream = await ai.models.generateContentStream(getScenarioConfig("gemini-2.0-flash"));
      }

      for await (const chunk of resultStream) {
        if (chunk.text) {
          const data = JSON.stringify({ text: chunk.text });
          res.write(`data: ${data}\n\n`);
        }
      }
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      console.error("Scenario Stream Proxy Error:", error);
      res.write(`data: {"error": "Failed to generate scenario"}\n\n`);
      res.end();
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
