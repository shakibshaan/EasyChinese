import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";

function sanitizeInput(text: string): string {
  if (!text) return text;
  let sanitized = text.replace(/`/g, '');
  sanitized = sanitized.replace(/system:/gi, '');
  sanitized = sanitized.replace(/assistant:/gi, '');
  sanitized = sanitized.replace(/user:/gi, '');
  return sanitized.trim().slice(0, 200);
}

function isValidCacheEntry(data: any): boolean {
  return (
    typeof data.originalText === 'string' &&
    typeof data.translatedText === 'string' &&
    typeof data.grammar === 'string' &&
    typeof data.contextUsage === 'string' &&
    Array.isArray(data.breakdown) &&
    Array.isArray(data.contextExamples) &&
    data.originalText.length < 500 &&
    data.translatedText.length < 500
  );
}

async function startServer() {
  const app = express();
  app.set("trust proxy", 1);
  const PORT = 3000;

  const corsOptions = {
    origin: process.env.APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST', 'OPTIONS', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
  };
  app.use(cors(corsOptions));

  app.use(express.json({ limit: '10mb' }));

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { success: false, error: "Too many requests, please slow down." },
    validate: { trustProxy: false, xForwardedForHeader: false }
  });

  app.use('/api/', apiLimiter);

  const upload = multer({
    limits: {
      fileSize: 4 * 1024 * 1024,
      files: 5
    },
    fileFilter: (req, file, cb) => {
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedTypes.includes(file.mimetype)) {
        cb(new Error("Invalid file type"));
      } else {
        cb(null, true);
      }
    }
  });

  // Extract Text from images
  app.post("/api/extract-text", (req, res) => {
    upload.array('images', 5)(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, error: err.message });
      } else if (err) {
        return res.status(400).json({ success: false, error: err.message });
      }

      try {
        if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
          return res.status(400).json({ success: false, error: "No images provided" });
        }

        const files = req.files as Express.Multer.File[];
        console.log(`Backend: Received ${files.length} images for extraction.`);
        
        const apiKey = process.env.GEMINI_API_KEY?.trim();
        if (!apiKey || apiKey === "your_api_key_here" || apiKey.includes("MY_GEMINI_API_KEY")) {
          return res.status(500).json({ success: false, error: "API key not configured in AI Studio Secrets" });
        }

        const ai = new GoogleGenAI({ apiKey });
        
        const parts: any[] = [
          "You are a Chinese text extractor. Extract ONLY Chinese characters from this image. This is likely a screenshot of a Chinese video, movie, TV show, or social media. Focus on subtitle text at the bottom of the image, speech bubbles, or any Chinese text overlaid on the image. Return ONLY the extracted Chinese text with no explanation, no pinyin, no translation. If multiple lines exist, separate them with a newline. If no Chinese text is found, return exactly the string: NO_TEXT_FOUND"
        ];

        for (const file of files) {
          parts.push({
            inlineData: {
              data: file.buffer.toString("base64"),
              mimeType: file.mimetype
            }
          });
        }

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: parts
        });

        let extractedText = response.text || "NO_TEXT_FOUND";
        
        if (extractedText.trim() === "NO_TEXT_FOUND") {
          return res.json({ success: true, extractedText: "", imageCount: files.length });
        }

        let lines = extractedText.split('\n').map(l => l.replace(/<[^>]*>/g, '').trim()).filter(l => l !== "" && l !== "NO_TEXT_FOUND");
        lines = Array.from(new Set(lines));
        extractedText = lines.join('\n').slice(0, 2000);

        res.json({ success: true, extractedText, imageCount: files.length });
      } catch (error: any) {
        console.error("Extraction error:", error);
        
        let errorMessage = "Extraction failed";
        let statusCode = 500;
        
        if (error.message?.includes("429") || error.status === 429 || error.message?.includes("RESOURCE_EXHAUSTED")) {
          errorMessage = "Gemini API quota exceeded. Please try again in a minute.";
          statusCode = 429;
        }
        
        res.status(statusCode).json({ success: false, error: errorMessage, details: String(error.message) });
      }
    });
  });

  // Gemini Embedding Endpoint
  app.post("/api/embed", async (req, res) => {
    try {
      let { text } = req.body;
      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      text = sanitizeInput(text);

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || apiKey === "your_api_key_here" || apiKey.includes("MY_GEMINI_API_KEY")) {
        return res.status(500).json({ success: false, error: "API key not configured in AI Studio Secrets" });
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
      let { text } = req.body;

      if (!text || typeof text !== 'string') {
        return res.status(400).json({ success: false, error: "Text is required" });
      }

      if (text.length > 200) {
        return res.status(400).json({ success: false, error: "Text too long (max 200 chars)" });
      }

      text = sanitizeInput(text);

      // Cache reading placeholder. Validate if using!
      // const cacheEntry = await readFromGlobalSentenceCache(text);
      // if (cacheEntry && isValidCacheEntry(cacheEntry)) { return res.json({ success: true, data: cacheEntry }); }

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || apiKey === "your_api_key_here" || apiKey.includes("MY_GEMINI_API_KEY")) {
        console.error("Backend: Valid GEMINI_API_KEY is missing. Currently set to:", apiKey);
        return res.status(500).json({ success: false, error: "API key not configured in AI Studio Secrets" });
      }

      console.log(`Backend: Initializing Gemini with API key length: ${apiKey.length}`);
      const ai = new GoogleGenAI({ apiKey });

      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: `Analyze: "${text}"`,
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
        console.warn("Primary model failed, falling back to gemini-2.0-flash:", error);
        response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: `Analyze: "${text}"`,
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

      let statusCode = 500;
      let errorMessage = "AI request failed";
      
      if (errorDetails.includes("429") || error.status === 429 || errorDetails.includes("RESOURCE_EXHAUSTED")) {
        errorMessage = "Gemini API quota exceeded. Please try again in a minute.";
        statusCode = 429;
      }

      res.status(statusCode).json({ 
        success: false, 
        error: errorMessage,
        details: errorDetails
      });
    }
  });

  // Scenario Endpoint
  app.post("/api/scenario/stream", async (req, res) => {
    try {
      let { scenario, isContinuation, previousSentences } = req.body;

      if (!scenario || typeof scenario !== 'string') {
        return res.status(400).json({ success: false, error: "Scenario is required" });
      }

      if (scenario.length > 200) {
        return res.status(400).json({ success: false, error: "Scenario too long (max 200 chars)" });
      }

      scenario = sanitizeInput(scenario);

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const timeoutId = setTimeout(() => {
        res.write(`data: {"error": "Request timeout"}\n\n`);
        res.end();
      }, 30000);

      req.on('close', () => clearTimeout(timeoutId));

      const apiKey = process.env.GEMINI_API_KEY?.trim();
      if (!apiKey || apiKey === "your_api_key_here" || apiKey.includes("MY_GEMINI_API_KEY")) {
        clearTimeout(timeoutId);
        res.write(`data: {"error": "API key not configured in AI Studio Secrets"}\n\n`);
        return res.end();
      }

      const ai = new GoogleGenAI({ apiKey });

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

      let contents = `Scenario: "${scenario}"`;
      if (isContinuation && previousSentences) {
        instruction += `\n\nThis is a continuation of a scenario. Here are the previous sentences:\n${JSON.stringify(previousSentences)}. \n\nProvide 3 or 4 MORE sentences that logically follow the previous ones.`;
        contents = `Scenario: "${scenario}"\nProvide 3 or 4 MORE sentences that logically follow the previous ones.`;
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
      clearTimeout(timeoutId);
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