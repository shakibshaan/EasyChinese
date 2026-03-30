import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

export const runtime = "nodejs";
export const preferredRegion = "sin1";

export async function POST(request: Request) {
  try {
    const { text } = await request.json();

    if (!text || typeof text !== 'string') {
      return Response.json({ success: false, error: "Text is required" }, { status: 400 });
    }

    if (text.length > 200) {
      return Response.json({ success: false, error: "Text too long (max 200 chars)" }, { status: 400 });
    }

    const apiKey = process.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Backend: VITE_GEMINI_API_KEY is missing");
      return Response.json({ success: false, error: "AI configuration error" }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });
    const trimmedText = text.trim();

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite-preview",
      contents: `Analyze for a language learner (ZH ↔ EN). 
    1. If EN, translate to ZH + Pinyin.
    2. If ZH, provide Pinyin.
    3. Word-by-word breakdown.
    4. Grammar & Context notes.
    5. "tokens" array for ZH sentence (text & pinyin). Include punctuation (no pinyin).
    6. In grammar/context, always add Pinyin in () after ZH chars.
    
    Sentence: "${trimmedText}"`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
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
            grammar: { type: Type.STRING, description: "Detailed grammar explanation of the sentence." },
            context: { type: Type.STRING, description: "Contextual notes, cultural nuances, or usage tips." }
          },
          required: ["originalText", "translatedText", "breakdown", "grammar", "context"]
        }
      }
    });

    const resultText = response.text || "{}";
    const cleanJson = resultText.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    const data = JSON.parse(cleanJson);

    return Response.json({ success: true, data });
  } catch (error) {
    console.error("Gemini Proxy Error:", error);
    return Response.json({ success: false, error: "AI request failed" }, { status: 500 });
  }
}
