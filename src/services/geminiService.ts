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

export interface ContextExample {
  text: string;
  pinyin: string;
  translation: string;
}

export interface SentenceAnalysis {
  originalText: string;
  translatedText: string;
  pinyin?: string;
  educationalConfidenceScore?: number;
  tokens?: SentenceToken[];
  breakdown: WordBreakdown[];
  grammar: string;
  contextUsage: string;
  contextExamples: ContextExample[];
}

export async function analyzeSentence(text: string): Promise<SentenceAnalysis> {
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Analysis failed');
  }

  const result = await response.json();
  return result.data;
}
