import React, { useEffect, useState, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X, BookmarkPlus, CheckCircle2 } from 'lucide-react';
import { analyzeSentence, SentenceAnalysis } from '../services/geminiService';
import { toast } from 'sonner';

interface SelectionPopoverProps {
  text: string;
  position: { x: number; y: number };
  onClose: () => void;
  onSave?: (analysis: SentenceAnalysis) => void;
}

export const SelectionPopover = forwardRef<HTMLDivElement, SelectionPopoverProps>(
  ({ text, position, onClose, onSave }, ref) => {
    const [loading, setLoading] = useState(true);
    const [data, setData] = useState<SentenceAnalysis | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
      let isMounted = true;
      
      const fetchData = async () => {
        setLoading(true);
        setError(null);
        setSaved(false);
        try {
          const result = await analyzeSentence(text);
          if (isMounted) {
            setData(result);
          }
        } catch (err: any) {
          if (isMounted) {
            setError(err.message || 'Failed to analyze text');
          }
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      };

      fetchData();

      return () => {
        isMounted = false;
      };
    }, [text]);

    const handleSave = () => {
      if (data && onSave) {
        onSave(data);
        setSaved(true);
        toast.success("Saved to your library!");
      }
    };

    return (
      <div 
        className="absolute z-[9999] pointer-events-none"
        style={{ 
          left: position.x, 
          top: position.y - 12,
        }}
      >
        <motion.div
          ref={ref}
          initial={{ opacity: 0, scale: 0.95, x: '-50%', y: 'calc(-100% + 10px)' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-100%' }}
          exit={{ opacity: 0, scale: 0.95, x: '-50%', y: 'calc(-100% + 10px)' }}
          className="pointer-events-auto bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 w-[320px] max-w-[90vw] overflow-hidden flex flex-col"
          style={{ transformOrigin: 'bottom center' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Analysis</span>
            </div>
            <button 
              onClick={onClose}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-zinc-500">
                <Loader2 className="animate-spin text-indigo-500" size={24} />
                <span className="text-sm font-medium">Analyzing text...</span>
              </div>
            ) : error ? (
              <div className="text-center py-4 text-red-500 text-sm">
                {error}
              </div>
            ) : data ? (
              <div className="space-y-4">
                <div>
                  <p className="text-lg font-serif text-zinc-900 dark:text-white leading-tight mb-1">
                    {data.originalText}
                  </p>
                  {data.pinyin && (
                    <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                      {data.pinyin}
                    </p>
                  )}
                </div>
                
                <div className="p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-100 dark:border-zinc-800">
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">
                    {data.translatedText}
                  </p>
                </div>

                {data.breakdown && data.breakdown.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Word Breakdown</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {data.breakdown.map((item, idx) => (
                        <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 shadow-sm">
                          <div className="flex flex-col min-w-[60px]">
                            <span className="text-sm font-serif font-bold text-zinc-900 dark:text-white">{item.word}</span>
                            <span className="text-[10px] text-indigo-500 font-medium lowercase">{item.pinyin}</span>
                          </div>
                          <div className="flex-1 border-l border-zinc-100 dark:border-zinc-800 pl-2">
                            <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-tight">
                              <span className="font-bold text-zinc-500 mr-1">[{item.pos}]</span>
                              {item.translation}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>

          {/* Footer Actions */}
          {!loading && !error && data && (
            <div className="p-3 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saved}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-500 transition-colors disabled:opacity-50 disabled:bg-green-600"
              >
                {saved ? <CheckCircle2 size={14} /> : <BookmarkPlus size={14} />}
                {saved ? 'Saved' : 'Save to Library'}
              </button>
            </div>
          )}
        </motion.div>
        
        {/* Pointer Triangle */}
        <div 
          className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white dark:border-t-zinc-900 drop-shadow-md"
        />
      </div>
    );
  }
);

SelectionPopover.displayName = 'SelectionPopover';
