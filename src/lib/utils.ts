import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const playAudio = (text: string, lang: string = 'zh-CN') => {
  if (!window.speechSynthesis) return;
  
  // Cancel any ongoing speech
  window.speechSynthesis.cancel();
  
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = lang;
  
  // Try to find a specific Chinese voice for better quality if available
  const voices = window.speechSynthesis.getVoices();
  const zhVoice = voices.find(v => v.lang.includes('zh') || v.lang.includes('cmn'));
  if (zhVoice) {
    utterance.voice = zhVoice;
  }
  
  // Adjust rate slightly for better clarity
  utterance.rate = 0.70;
  
  window.speechSynthesis.speak(utterance);
};

export function parsePartialScenario(jsonStr: string) {
  const sentences: any[] = [];
  let title = "";
  
  try {
     const titleMatch = jsonStr.match(/"scenarioTitle"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
     if (titleMatch) title = titleMatch[1];
  } catch(e) {}

  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (inString) {
      if (escape) escape = false;
      else if (c === '\\') escape = true;
      else if (c === '"') inString = false;
    } else {
      if (c === '"') inString = true;
      else if (c === '{') {
        depth++;
        if (depth === 2) {
          objStart = i;
        }
      } else if (c === '}') {
        if (depth === 2 && objStart !== -1) {
          try {
            const objStr = jsonStr.substring(objStart, i + 1);
            const obj = JSON.parse(objStr);
            if (obj.originalText) {
              sentences.push(obj);
            }
          } catch(e) {
            // might fail if JSON is malformed
          }
          objStart = -1;
        }
        depth--;
      }
    }
  }
  
  return { scenarioTitle: title, sentences };
}

