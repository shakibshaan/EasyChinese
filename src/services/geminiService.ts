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
  const normalizedText = text.trim().toLowerCase();
  
  // 1. Check Firestore Cache
  try {
    const cacheRef = collection(db, 'global_sentence_cache');
    const q = query(cacheRef, where('normalized_sentence', '==', normalizedText));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      const cacheDoc = querySnapshot.docs[0];
      // Update hit count and last used in background if authenticated
      if (auth.currentUser) {
        updateDoc(doc(db, 'global_sentence_cache', cacheDoc.id), {
          hit_count: increment(1),
          last_used: serverTimestamp()
        }).catch(console.error);
      }
      
      return cacheDoc.data().translation_json as SentenceAnalysis;
    }
  } catch (error) {
    console.error("Cache read error:", error);
    // Continue to API if cache fails
  }

  // 2. Call API
  const response = await fetch('/api/analyze', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.details || error.error || 'Analysis failed');
  }

  const result = await response.json();
  const data = result.data;

  // 3. Save to Cache
  if (auth.currentUser) {
    try {
      await addDoc(collection(db, 'global_sentence_cache'), {
        normalized_sentence: normalizedText,
        translation_json: data,
        model_version: "gemini-3-flash-preview",
        created_at: serverTimestamp(),
        last_used: serverTimestamp(),
        hit_count: 1
      });
    } catch (error) {
      console.error("Cache write error:", error);
    }
  }

  return data;
}
