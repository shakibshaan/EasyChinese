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

  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: trimmedText }),
  });

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error || "Analysis failed");
  }

  const result = json.data as SentenceAnalysis;
  
  // Store in cache
  if (result && result.originalText) {
    const updatedCache = { ...getCache(), [trimmedText]: result };
    saveCache(updatedCache);
  }
  
  return result;
}
