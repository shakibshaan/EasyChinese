import React, { useState } from 'react';
import { Loader2, Sparkles, Volume2, BookmarkPlus, CheckCircle2, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, playAudio, parsePartialScenario } from '../lib/utils';
import { User } from 'firebase/auth';
import { toast } from 'sonner';

interface SentenceToken {
  text: string;
  pinyin?: string;
}

interface SavedSentence {
  id: string;
  originalText: string;
  translatedText: string;
  folderId: string;
}

interface ScenariosProps {
  savedSentences: SavedSentence[];
  flashcards: any[];
  handleSaveWord: (word: any) => void;
  setItemToSave: (item: any) => void;
  setIsFolderSelectOpen: (open: boolean) => void;
  user: User | null;
  setIsAuthModalOpen: (open: boolean) => void;
  renderTokenizedText: (text: string, tokens?: SentenceToken[], pinyin?: string, showPinyin?: boolean, showChinese?: boolean, size?: 'sm' | 'lg' | 'mcq' | 'scenario', isLibrary?: boolean) => React.ReactNode;
}

const Scenarios: React.FC<ScenariosProps> = ({ 
  savedSentences, 
  flashcards,
  handleSaveWord,
  setItemToSave, 
  setIsFolderSelectOpen, 
  user, 
  setIsAuthModalOpen,
  renderTokenizedText
}) => {
  const [scenarioInput, setScenarioInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [scenarioData, setScenarioData] = useState<any>(null);
  const [expandedVocab, setExpandedVocab] = useState<Record<number, boolean>>({});
  const [generatingMore, setGeneratingMore] = useState(false);

  const toggleVocab = (idx: number) => {
    setExpandedVocab(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const startStream = async (isContinuation = false) => {
    if (!scenarioInput.trim()) return;
    
    let previousSentences: any = [];
    if (isContinuation) {
      setGeneratingMore(true);
      previousSentences = scenarioData?.sentences || [];
    } else {
      setLoading(true);
      setScenarioData(null);
    }

    try {
      const response = await fetch('/api/scenario/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scenario: scenarioInput,
          isContinuation,
          previousSentences: previousSentences.map((s: any) => ({ originalText: s.originalText, translatedText: s.translatedText }))
        })
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      let accumulatedRawText = '';
      
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          const chunkStr = decoder.decode(value, { stream: true });
          
          const Math_random = chunkStr; // avoid minifier bugs
          const lines = chunkStr.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.substring(6);
              if (dataStr === '[DONE]') {
                break;
              }
              try {
                const data = JSON.parse(dataStr);
                if (data.error) {
                  toast.error(data.error);
                  break;
                }
                if (data.text) {
                  accumulatedRawText += data.text;
                  const partialData = parsePartialScenario(accumulatedRawText);
                  
                  if (partialData.sentences.length > 0 || partialData.scenarioTitle) {
                    setScenarioData((prev: any) => {
                      if (isContinuation) {
                        return {
                          scenarioTitle: prev?.scenarioTitle || partialData.scenarioTitle,
                          sentences: [...previousSentences, ...partialData.sentences]
                        };
                      }
                      return partialData;
                    });
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        }
      }
    } catch (e) {
      toast.error("An error occurred");
    } finally {
      setLoading(false);
      setGeneratingMore(false);
    }
  };

  const generateScenario = () => startStream(false);
  const generateMore = () => startStream(true);

  const handleSaveSentence = (st: any) => {
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    const fakeAnalysis = {
      originalText: st.originalText,
      translatedText: st.translatedText,
      pinyin: st.pinyin,
      tokens: st.tokens,
      educationalConfidenceScore: 90,
      breakdown: [],
      grammar: "Scenario sentence",
      contextUsage: scenarioData.scenarioTitle,
      contextExamples: []
    };
    const savedIn = savedSentences.filter((s:any) => s.originalText === st.originalText).map((s:any) => s.folderId);
    setItemToSave({ type: 'sentence', data: fakeAnalysis, savedInFolders: savedIn });
    setIsFolderSelectOpen(true);
  };

  return (
    <div className="max-w-4xl mx-auto py-8 lg:py-12 px-4 pb-32">
      <div className="mb-8 md:mb-12 text-center max-w-2xl mx-auto">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-3xl mb-6 shadow-sm">
          <Sparkles size={32} />
        </div>
        <h2 className="text-3xl md:text-5xl font-serif font-bold text-zinc-900 dark:text-white mb-4">Scenario Learning</h2>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl mx-auto">Input any event or situation, and the AI will generate a timeline of practical sentences you'll need.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-16 max-w-3xl mx-auto relative z-20">
        <input 
          type="text" 
          value={scenarioInput}
          onChange={(e) => setScenarioInput(e.target.value)}
          placeholder="e.g. Taking a taxi, Ordering food, Opening a bank account..."
          className="flex-1 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl px-6 py-4 text-lg focus:outline-none focus:border-blue-500 shadow-sm text-zinc-900 dark:text-white"
          onKeyDown={(e) => e.key === 'Enter' && generateScenario()}
        />
        <button 
          onClick={generateScenario}
          disabled={loading || !scenarioInput.trim()}
          className="bg-blue-600 dark:bg-blue-600 text-white rounded-2xl px-8 py-4 text-lg font-bold shadow-xl shadow-blue-500/20 hover:bg-blue-500 disabled:opacity-50 whitespace-nowrap flex items-center justify-center gap-3 transition-all hover:-translate-y-1"
        >
          {loading ? <Loader2 className="animate-spin" size={24} /> : <Sparkles size={24} />}
          {loading ? "Generating..." : "Generate"}
        </button>
      </div>

      {loading && !scenarioData && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-12 mt-16 max-w-3xl mx-auto">
          <div className="flex flex-col items-center gap-3 mb-12">
            <div className="h-10 w-3/4 max-w-md bg-zinc-200 dark:bg-zinc-800 rounded-2xl animate-pulse"></div>
            <div className="h-1 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-full animate-pulse" />
          </div>
          <div className="relative before:absolute before:inset-0 before:ml-[1.125rem] before:h-full before:w-1 before:bg-zinc-100 dark:before:bg-zinc-800/50 pb-10">
            {[1, 2, 3].map((idx) => (
              <div key={idx} className="relative flex items-start gap-4 md:gap-6 mb-8">
                <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-4 border-zinc-50 dark:border-zinc-950 bg-zinc-200 dark:bg-zinc-800 shrink-0 z-10 mt-4 animate-pulse"></div>
                
                <div className="flex-1 bg-white dark:bg-zinc-900 p-4 md:p-6 rounded-3xl border border-zinc-100 dark:border-zinc-800 shadow-sm">
                  <div className="flex justify-end mb-6 gap-2">
                    <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl animate-pulse"></div>
                    <div className="w-10 h-10 bg-zinc-100 dark:bg-zinc-800/80 rounded-xl animate-pulse"></div>
                  </div>
                  
                  <div className="mb-6 flex justify-center items-end gap-3 bg-zinc-50/50 dark:bg-zinc-950/50 py-8 px-4 rounded-3xl">
                    <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" style={{ animationDelay: '300ms' }}></div>
                    <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" style={{ animationDelay: '450ms' }}></div>
                    <div className="w-12 h-16 bg-zinc-200 dark:bg-zinc-800 rounded-xl animate-pulse" style={{ animationDelay: '600ms' }}></div>
                  </div>
                  
                  <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800 mb-6" />
                  
                  <div className="flex flex-col items-center gap-3 mb-4">
                    <div className="h-4 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse"></div>
                    <div className="h-4 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {scenarioData && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-12">
          <div className="flex flex-col items-center gap-3 mb-12">
             <h3 className="text-2xl md:text-3xl font-serif font-bold text-zinc-800 dark:text-zinc-200 text-center">{scenarioData.scenarioTitle}</h3>
             <div className="h-1 w-20 bg-blue-500 rounded-full" />
          </div>
          <div className="relative before:absolute before:inset-0 before:ml-[1.125rem] before:h-full before:w-1 before:bg-gradient-to-b before:from-blue-500/20 before:via-blue-500/10 before:to-transparent pb-10">
            {scenarioData.sentences.map((st: any, idx: number) => {
              const isSaved = savedSentences.some((s:any) => s.originalText === st.originalText);
              return (
                <div key={idx} className="relative flex items-start gap-4 md:gap-6 mb-8 last:mb-0 group">
                  {/* Timeline icon */}
                  <div className="flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-4 border-zinc-50 dark:border-zinc-950 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 shrink-0 shadow-sm z-10 font-bold text-xs md:text-sm mt-4">
                    {idx + 1}
                  </div>
                  
                  {/* Card */}
                  <div className="flex-1 min-w-0 bg-white dark:bg-zinc-900 p-4 md:p-6 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all md:group-hover:-translate-y-1">
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex gap-2 w-full justify-end">
                        <button 
                          onClick={() => playAudio(st.originalText)}
                          className="p-2.5 text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-xl transition-colors"
                        >
                          <Volume2 size={20} />
                        </button>
                        <button 
                          onClick={() => handleSaveSentence(st)}
                          className={cn(
                            "p-2.5 rounded-xl transition-colors",
                            isSaved 
                              ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30" 
                              : "text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          )}
                        >
                          {isSaved ? <CheckCircle2 size={20} /> : <BookmarkPlus size={20} />}
                        </button>
                      </div>
                    </div>
                    {/* Render text with tokens */}
                    <div className="mb-6 flex justify-center bg-zinc-50/50 dark:bg-zinc-950/50 py-6 px-4 rounded-3xl overflow-x-auto">
                      {renderTokenizedText(st.originalText, st.tokens, st.pinyin, true, true, 'scenario')}
                    </div>
                    <div className="h-px w-full bg-zinc-100 dark:bg-zinc-800 mb-6" />
                    <p className="text-zinc-700 dark:text-zinc-300 text-lg leading-relaxed text-center font-medium mb-8">"{st.translatedText}"</p>

                    {st.breakdown && st.breakdown.length > 0 && (
                      <div className="mt-8">
                        <button 
                          onClick={() => toggleVocab(idx)}
                          className="w-full flex items-center gap-2 mb-4 group focus:outline-none"
                        >
                           <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800 transition-colors group-hover:bg-blue-200 dark:group-hover:bg-blue-800" />
                           <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-50 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 transition-all border border-zinc-200 dark:border-zinc-700 group-hover:border-blue-200 dark:group-hover:border-blue-800">
                             <span className="text-[10px] font-mono uppercase tracking-[0.2em] font-bold">Vocabulary Breakdown</span>
                             <ChevronDown size={14} className={cn("transition-transform duration-300", expandedVocab[idx] ? "rotate-180" : "")} />
                           </div>
                           <div className="h-px flex-1 bg-zinc-100 dark:bg-zinc-800 transition-colors group-hover:bg-blue-200 dark:group-hover:bg-blue-800" />
                        </button>
                        
                        <motion.div 
                          initial={false}
                          animate={{ height: expandedVocab[idx] ? 'auto' : 0, opacity: expandedVocab[idx] ? 1 : 0 }}
                          className="overflow-hidden"
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-2 pt-2">
                            {st.breakdown.map((item: any, wordIdx: number) => {
                              const isWordSaved = flashcards.some((c: any) => c.front === item.word);
                              return (
                                <div key={wordIdx} className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:border-blue-200 dark:hover:border-blue-900 transition-colors">
                                  <div className="flex justify-between items-start mb-2">
                                    <div className="flex items-center flex-wrap gap-x-2">
                                      <span className="text-xl font-serif font-bold text-zinc-900 dark:text-white">{item.word}</span>
                                      {item.pinyin && <span className="text-sm font-medium text-blue-600 dark:text-blue-400 lowercase">{item.pinyin}</span>}
                                      <button 
                                        onClick={() => playAudio(item.word)}
                                        className="ml-1 text-zinc-400 hover:text-blue-600 transition-colors"
                                        title="Play pronunciation"
                                      >
                                        <Volume2 size={16} />
                                      </button>
                                    </div>
                                    <button 
                                      onClick={() => handleSaveWord(item)}
                                      className={cn(
                                        "p-2 rounded-xl transition-all shadow-sm",
                                        isWordSaved 
                                          ? "text-green-500 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30" 
                                          : "text-zinc-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-100 dark:hover:border-blue-800"
                                      )}
                                      title={isWordSaved ? "Remove from Flashcards" : "Save to Flashcards"}
                                    >
                                      {isWordSaved ? <CheckCircle2 size={14} /> : <BookmarkPlus size={14} />}
                                    </button>
                                  </div>
                                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 mb-1">{item.translation}</p>
                                  <p className="text-[10px] text-zinc-500 dark:text-zinc-500 leading-relaxed">{item.definition}</p>
                                </div>
                              );
                            })}
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-center mt-8 pb-12">
            <button 
              onClick={generateMore} 
              disabled={generatingMore || loading}
              className="bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl px-6 py-3 font-bold transition-all shadow-sm flex items-center gap-2 group"
            >
              {generatingMore ? <Loader2 className="animate-spin text-blue-500" size={20} /> : <Sparkles className="text-blue-500 group-hover:scale-110 transition-transform" size={20} />}
              {generatingMore ? "Generating..." : "Generate More Sentences"}
            </button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Scenarios;
