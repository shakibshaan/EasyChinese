import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  runtime: "nodejs",
  regions: ["sin1"],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    let { scenario, isContinuation, previousSentences } = req.body;

    if (!scenario || typeof scenario !== 'string') {
      return res.status(400).json({ success: false, error: "Scenario is required" });
    }

    if (scenario.length > 200) {
      return res.status(400).json({ success: false, error: "Scenario too long (max 200 chars)" });
    }

    // A simple sanitize since we can't import from server.ts easily here
    scenario = scenario.replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
2. Tokens must match original text exactly.
3. Breakdown must include translation and definition.`;

    if (isContinuation && previousSentences) {
      instruction += `\n\nThis is a continuation. Ensure the scenarioTitle is the same. Continue the story naturally after the following previous sentences:\n${previousSentences.map((s:any) => s.originalText).join("\n")}`;
    }

    const getScenarioConfig = (modelName: string): any => {
      return {
        model: modelName,
        contents: `Scenario: "${scenario}"`,
        config: {
          systemInstruction: instruction,
          temperature: 0.3,
          responseMimeType: "application/json",
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
      };
    };

    let resultStream;
    try {
      resultStream = await ai.models.generateContentStream(getScenarioConfig("gemini-2.5-flash"));
    } catch (error) {
      console.warn("Primary model failed, falling back:", error);
      resultStream = await ai.models.generateContentStream(getScenarioConfig("gemini-2.0-flash"));
    }

    clearTimeout(timeoutId);

    for await (const chunk of resultStream) {
      if (chunk.text) {
        // stream partial json chunks exactly as generated
        res.write(`data: ${JSON.stringify({ chunk: chunk.text })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error: any) {
    console.error("Gemini Scenario Stream Error:", error);
    res.write(`data: {"error": "Failed to generate scenario"}\n\n`);
    res.end();
  }
}
