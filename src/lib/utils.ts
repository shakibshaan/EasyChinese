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
