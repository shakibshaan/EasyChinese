import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';

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
  pinyin?: string;
  translation: string;
  tokens?: SentenceToken[];
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
  const normalizedText = text.trim().toLowerCase();
  const controller = new AbortController();
  
  // 1. Cache Task
  const cacheTask = (async () => {
    try {
      const cacheRef = collection(db, 'global_sentence_cache');
      const q = query(cacheRef, where('normalized_sentence', '==', normalizedText));
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const cacheDoc = querySnapshot.docs[0];
        if (auth.currentUser) {
          updateDoc(doc(db, 'global_sentence_cache', cacheDoc.id), {
            hit_count: increment(1),
            last_used: serverTimestamp()
          }).catch(() => {});
        }
        return cacheDoc.data().translation_json as SentenceAnalysis;
      }
    } catch (e) {
      console.error("Cache race error:", e);
    }
    throw new Error("Cache miss");
  })();

  // 2. API Task
  const apiTask = (async () => {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.details || error.error || 'Analysis failed');
    }

    const result = await response.json();
    const data = result.data;

    if (auth.currentUser) {
      addDoc(collection(db, 'global_sentence_cache'), {
        normalized_sentence: normalizedText,
        translation_json: data,
        model_version: "gemini-3.1-flash-lite-preview",
        created_at: serverTimestamp(),
        last_used: serverTimestamp(),
        hit_count: 1
      }).catch(() => {});
    }
    return data;
  })();

  try {
    const result = await Promise.any([cacheTask, apiTask]);
    controller.abort(); // Cancel API if cache won
    return result;
  } catch (error) {
    if (error instanceof AggregateError) {
      throw error.errors[error.errors.length - 1];
    }
    throw error;
  }
}