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
  explanation: string;
}

// Simple persistent cache to store analysis results
const CACHE_KEY = 'lingua_flow_analysis_cache_v2';
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
    // Limit cache size to avoid localStorage limits
    const keys = Object.keys(cache);
    if (keys.length > 50) {
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
    model: "gemini-3.1-flash-lite-preview", // Switched to Flash Lite for maximum speed
    contents: `Analyze the following sentence for a language learner (Chinese ↔ English). 
    IMPORTANT: 
    1. If the input is English, translate it to Chinese AND provide Pinyin for the Chinese translation.
    2. If the input is Chinese, provide Pinyin for the original text.
    3. Break it down word by word or character by character.
    4. Provide a full translation and a grammar/contextual explanation.
    5. Provide a "tokens" array for the Chinese sentence (either the original or the translation) where each element is an object with "text" (the Chinese word/character) and "pinyin" (its pinyin). This is for word-by-word alignment. Include punctuation as tokens without pinyin.
    6. In the "explanation" field, whenever you mention a Chinese word or phrase, always include its Pinyin in parentheses immediately after the Chinese characters (e.g., "坏了 (huài le)").
    
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
          explanation: { type: Type.STRING }
        },
        required: ["originalText", "translatedText", "breakdown", "explanation"]
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
