import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const getApiKey = () => {
  // 1. Try AI Studio's injected environment variable
  if (typeof process !== 'undefined' && process.env && process.env.GEMINI_API_KEY) {
    if (process.env.GEMINI_API_KEY !== "undefined") {
      return process.env.GEMINI_API_KEY;
    }
  }
  
  // 2. Try standard Vite environment variable (for local testing and Vercel)
  // @ts-ignore
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_GEMINI_API_KEY) {
    // @ts-ignore
    return import.meta.env.VITE_GEMINI_API_KEY;
  }

  console.warn("GEMINI_API_KEY is missing or invalid. Analysis will fail.");
  return "";
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export interface WordBreakdown {
  word: string;
  pinyin?: string;
  translation: string;
  pos?: string;
  definition: string;
  context?: string;
}

export interface SentenceToken {
  text: string;
  pinyin?: string;
}

export interface SentenceAnalysis {
  originalText: string;
  translatedText: string;
  pinyin?: string;
  tokens?: SentenceToken[];
  breakdown: WordBreakdown[];
  grammar: string;
  context: string;
}

// Simple persistent cache to store analysis results
const CACHE_KEY = 'hanzi_flow_analysis_cache_v4';
const getCache = (): Record<string, SentenceAnalysis> => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    return cached ? JSON.parse(cached) : {};
  } catch (e) {
    return {};
  }
};

const saveCache = (cache: Record<string, SentenceAnalysis>) => {
  try {
    // Limit cache size to avoid localStorage limits - increased for VPN users
    const keys = Object.keys(cache);
    if (keys.length > 100) {
      delete cache[keys[0]];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Failed to save cache:", e);
  }
};

export async function analyzeSentence(text: string): Promise<SentenceAnalysis> {
  const trimmedText = text.trim();
  const cache = getCache();
  
  // Check cache first
  if (cache[trimmedText]) {
    return cache[trimmedText];
  }

  const apiKey = getApiKey();
  console.log("Attempting analysis with API key present:", !!apiKey, "Length:", apiKey.length);
  if (!apiKey) {
    throw new Error("Gemini API key is missing. Please check your environment variables.");
  }

// api model

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

  let result: SentenceAnalysis;
  try {
    const text = response.text || "{}";
    // Remove potential markdown code blocks if the model returned them
    const cleanJson = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    result = JSON.parse(cleanJson) as SentenceAnalysis;
  } catch (e) {
    console.error("Failed to parse Gemini response:", e, response.text);
    throw new Error("Failed to parse analysis results. Please try again.");
  }
  
  // Store in cache
  if (result && result.originalText) {
    const updatedCache = { ...getCache(), [trimmedText]: result };
    saveCache(updatedCache);
  }
  
  return result;
}
