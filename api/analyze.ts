import { GoogleGenAI, Type } from "@google/genai";

export const config = {
  runtime: "nodejs",
  regions: ["hkg1"],
};

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: "Text is required" });
    }

    if (text.length > 200) {
      return res.status(400).json({ success: false, error: "Text too long (max 200 chars)" });
    }

    const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Backend: GEMINI_API_KEY is missing");
      return res.status(500).json({ success: false, error: "AI configuration error: API key missing" });
    }

    const ai = new GoogleGenAI({ apiKey });
    const trimmedText = text.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze for a language learner (ZH ↔ EN). 
    1. If EN, translate to ZH + Pinyin.
    2. If ZH, provide Pinyin.
    3. Word-by-word breakdown.
    4. Grammar: Output ONLY the main grammar structure in one line, followed by a one-line brief explanation. Max 2 lines total.
    5. Context: 1) A brief sentence on usage in China. 2) Provide exactly two short example sentences.
    6. "tokens" array for ZH sentence (text & pinyin). Include punctuation (no pinyin).
    7. In grammar/contextUsage, always add Pinyin in () after ZH chars.
    8. Be extremely concise. Minimize characters while remaining helpful.
    
    Sentence: "${trimmedText}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            originalText: { type: Type.STRING },
            translatedText: { type: Type.STRING },
            pinyin: { type: Type.STRING, description: "The Pinyin for the Chinese text (either the original or the translation)." },
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
            grammar: { type: Type.STRING, description: "One line for structure, one line for brief explanation. Max 2 lines total." },
            contextUsage: { type: Type.STRING, description: "Brief usage in China. Be very concise." },
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
          required: ["originalText", "translatedText", "breakdown", "grammar", "contextUsage", "contextExamples"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Empty response from AI");
    }

    const cleanJson = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const data = JSON.parse(cleanJson);

    return res.status(200).json({ success: true, data });
  } catch (error: any) {
    console.error("Gemini Proxy Error:", error);
    return res.status(500).json({ 
      success: false, 
      error: error.message || "AI request failed",
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}
