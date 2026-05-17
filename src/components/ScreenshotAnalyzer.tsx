import React, { useState, useRef, useCallback, useEffect } from 'react';
import { User } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Camera, Image as ImageIcon, X, Plus, Loader2, Bookmark, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../lib/utils';
import { SentenceAnalysis, SentenceToken, analyzeSentence } from '../services/geminiService';

interface ScreenshotAnalyzerProps {
  user: User | null;
  onOpenAuthModal: () => void;
  renderTokenizedText: (
    text: string, 
    tokens?: SentenceToken[], 
    pinyin?: string, 
    showPinyin?: boolean, 
    showChinese?: boolean, 
    size?: 'sm' | 'lg' | 'mcq' | 'scenario',
    isLibrary?: boolean
  ) => React.ReactNode;
  theme: 'dark' | 'light';
}

export function ScreenshotAnalyzer({ user, onOpenAuthModal, renderTokenizedText, theme }: ScreenshotAnalyzerProps) {
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [editedText, setEditedText] = useState<string>('');
  const [analysisResults, setAnalysisResults] = useState<SentenceAnalysis[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [openBreakdowns, setOpenBreakdowns] = useState<Record<number, boolean>>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      imagePreviews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imagePreviews]);

  const validateAndAddFiles = (files: FileList | File[]) => {
    const currentCount = images.length;
    const addedFiles: File[] = [];
    const newPreviews: string[] = [];
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    let errorShown = false;

    for (let i = 0; i < files.length; i++) {
      if (currentCount + addedFiles.length >= 5) {
        if (!errorShown) {
          toast.error("Maximum 5 images allowed");
          errorShown = true;
        }
        break;
      }

      const file = files[i];

      if (!allowedTypes.includes(file.type)) {
        toast.error(`Invalid file type: ${file.name}`);
        continue;
      }

      if (file.size > 4 * 1024 * 1024) {
        toast.error(`File too large (max 4MB): ${file.name}`);
        continue;
      }

      addedFiles.push(file);
      newPreviews.push(URL.createObjectURL(file));
    }

    if (addedFiles.length > 0) {
      setImages(prev => [...prev, ...addedFiles]);
      setImagePreviews(prev => [...prev, ...newPreviews]);
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  }, [images]);

  const compressImage = (file: File): Promise<Blob> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxDim = 1000;
          
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(file);
          ctx.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob((blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file); // Fallback to original
            }
          }, 'image/jpeg', 0.6); // Compress to 60% JPEG for much smaller payload
        };
        img.onerror = () => resolve(file);
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
    }
    // reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
    setImagePreviews(prev => {
      const newPreviews = [...prev];
      URL.revokeObjectURL(newPreviews[index]);
      newPreviews.splice(index, 1);
      return newPreviews;
    });
  };

  const handleExtractAndAnalyze = async () => {
    if (images.length === 0) return;

    setIsExtracting(true);
    setExtractedText('');
    setEditedText('');
    setAnalysisResults([]);
    
    // Step 1: Extract Text
    try {
      const formData = new FormData();
      
      // Compress images before sending to prevent 413 Payload Too Large / "Failed to fetch" (CORS missing on proxy 413)
      for (const img of images) {
        const compressedBlob = await compressImage(img);
        formData.append('images', compressedBlob, img.name);
      }

      const res = await fetch('/api/extract-text', {
        method: 'POST',
        body: formData
      });

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.indexOf("application/json") !== -1) {
        data = await res.json();
      } else {
        const textResponse = await res.text();
        throw new Error(`Server error (${res.status}): ${textResponse.slice(0, 100) || "Empty response from server"}`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to extract text: ${res.status}`);
      }

      const text = data.extractedText || '';
      setExtractedText(text);
      setEditedText(text);
      
      if (!text.trim()) {
        setIsExtracting(false);
        return; // UI handles empty string directly
      }

      // Step 2: Analyze Text
      setIsExtracting(false);
      setIsAnalyzing(true);
      await analyzeExtractedText(text);

    } catch (err: any) {
      toast.error(err.message || "An error occurred");
      setIsExtracting(false);
      setIsAnalyzing(false);
    }
  };

  const analyzeExtractedText = async (textToAnalyze: string) => {
    const lines = textToAnalyze.split('\n').filter(l => l.trim().length > 0).slice(0, 5);
    
    if (lines.length === 0) {
      setIsAnalyzing(false);
      return;
    }

    try {
      const promises = lines.map(line => analyzeSentence(line));
      const results = await Promise.allSettled(promises);
      
      const successfulAnalyses: SentenceAnalysis[] = [];
      let failCount = 0;

      results.forEach(res => {
        if (res.status === 'fulfilled') {
          successfulAnalyses.push(res.value);
        } else {
          failCount++;
        }
      });

      setAnalysisResults(successfulAnalyses);
      
      if (successfulAnalyses.length > 0) {
        toast.success(`Analysis complete! (${successfulAnalyses.length} lines)`);
      }
      
      if (failCount > 0) {
        toast.error(`${failCount} lines could not be analyzed`);
      }

    } catch(err) {
       toast.error("Failed to analyze the text");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReAnalyze = () => {
    if (!editedText.trim()) return;
    setIsAnalyzing(true);
    setAnalysisResults([]);
    analyzeExtractedText(editedText);
  };

  const toggleBreakdown = (index: number) => {
    setOpenBreakdowns(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const handleSaveClick = () => {
    if (!user) {
      onOpenAuthModal();
    } else {
      toast.success("Saved to library! (Placeholder)");
      // Note: Actual saving logic would go here depending on the DB schema
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-8 pb-32">
      
      {/* Upload Zone */}
      <section className="space-y-4">
        <label className="block text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider px-1">
          Add Screenshots
        </label>
        
        <div 
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative w-full overflow-hidden transition-all duration-300 rounded-3xl cursor-pointer border-2 border-dashed flex flex-col items-center justify-center min-h-[200px] p-6",
            images.length > 0 ? "border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50" : "bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-400 dark:hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20",
            isDraggingOver && "border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-900/20",
          )}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            multiple 
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileInputChange}
          />
          
          {images.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 flex items-center justify-center">
                <Camera size={32} strokeWidth={1.5} />
              </div>
              <div>
                <p className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Drop screenshots here</p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Up to 5 images • JPG, PNG, WebP</p>
              </div>
            </div>
          ) : (
            <div className="w-full">
              <div className="flex gap-4 overflow-x-auto pb-4 snap-x hide-scrollbar" onClick={e => e.stopPropagation()}>
                <AnimatePresence mode="popLayout">
                  {imagePreviews.map((preview, i) => (
                    <motion.div 
                      key={preview}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="relative shrink-0 snap-start"
                    >
                      <img 
                        src={preview} 
                        alt="Screenshot preview" 
                        className="w-[120px] h-[120px] object-cover rounded-2xl border border-black/5 dark:border-white/10"
                      />
                      <button
                        onClick={() => removeImage(i)}
                        className="absolute -top-2 -right-2 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-full p-1 shadow-md hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                      >
                        <X size={14} strokeWidth={3} />
                      </button>
                    </motion.div>
                  ))}
                  
                  {images.length < 5 && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="shrink-0 w-[120px] h-[120px] rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-400 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Plus size={24} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <p className="text-xs text-center text-zinc-500 dark:text-zinc-400 font-medium">
                {images.length}/5 images
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Extract Button Section */}
      <section className="space-y-3">
        <button
          onClick={handleExtractAndAnalyze}
          disabled={images.length === 0 || isExtracting || isAnalyzing}
          className="w-full relative flex items-center justify-center gap-3 py-4 rounded-2xl bg-indigo-600 text-white font-medium shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-500 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none disabled:active:scale-100"
        >
          {isExtracting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>Scanning images for Chinese text...</span>
            </>
          ) : isAnalyzing ? (
             <>
               <Loader2 size={20} className="animate-spin" />
               <span>Analyzing extracted text...</span>
             </>
          ) : (
            <>
              <Camera size={20} />
              <span>Extract & Analyze</span>
            </>
          )}
        </button>
        <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
          AI will extract Chinese text from your screenshots and analyze it
        </p>
      </section>

      {/* Extracted Text Preview area AFTER extraction */}
      {extractedText !== '' && (
        <section className="bg-white dark:bg-zinc-900 p-6 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm space-y-4">
           <div className="flex justify-between items-center px-1">
             <label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
               Extracted Text
             </label>
           </div>
           
           <textarea
             value={editedText}
             onChange={e => setEditedText(e.target.value)}
             className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 min-h-[100px] text-zinc-900 dark:text-zinc-100 font-medium leading-relaxed focus:ring-2 focus:ring-indigo-500 focus:outline-none resize-y"
             placeholder="Extracted text will appear here..."
           />
           
           {editedText !== extractedText && editedText !== '' && !isAnalyzing && (
              <div className="flex justify-end">
                <button 
                  onClick={handleReAnalyze}
                  className="px-4 py-2 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-xl text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                >
                  Re-analyze Changes
                </button>
              </div>
           )}
        </section>
      )}
      
      {/* Empty State after extraction completed but no text found */}
      {extractedText === '' && images.length > 0 && !isExtracting && !isAnalyzing && (analysisResults.length === 0) && (
        <div className="text-center bg-white dark:bg-zinc-900 p-8 border border-zinc-100 dark:border-zinc-800 rounded-3xl shadow-sm">
           <ImageIcon size={32} className="mx-auto text-zinc-300 dark:text-zinc-700 mb-4" />
           <h3 className="text-zinc-900 dark:text-white font-medium mb-1">No Chinese text detected in your screenshots</h3>
           <p className="text-zinc-500 text-sm">Try clearer images or screenshots with visible subtitles</p>
        </div>
      )}

      {/* Settings / Results / List */}
      {analysisResults.length > 0 && (
        <section className="space-y-6 pt-4">
          <h3 className="text-lg font-bold text-zinc-900 dark:text-white px-2">Analysis Results</h3>
          
          <div className="space-y-6">
            {analysisResults.map((analysis, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-100 dark:border-zinc-800 p-6 md:p-8 shadow-sm"
              >
                 <div className="flex justify-between items-start mb-6">
                   <div className="w-full text-left">
                      {renderTokenizedText(analysis.originalText, analysis.tokens, analysis.pinyin, true, true, analysisResults.length === 1 ? 'lg' : 'scenario')}
                   </div>
                   <button 
                     onClick={handleSaveClick}
                     className="shrink-0 ml-4 p-2.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-indigo-500 transition-colors"
                   >
                     <Bookmark size={20} strokeWidth={2} />
                   </button>
                 </div>

                 <p className="text-base text-zinc-700 dark:text-zinc-300 font-medium leading-relaxed mb-6">
                   {analysis.translatedText}
                 </p>

                 <div className="bg-zinc-50 dark:bg-zinc-950 rounded-2xl overflow-hidden mt-6">
                    <button 
                      onClick={() => toggleBreakdown(index)}
                      className="w-full flex items-center justify-between p-4 px-5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors"
                    >
                      <span className="flex items-center gap-2">
                         Breakdown & Grammar
                         <span className="px-2 py-0.5 rounded-full bg-zinc-200/50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 text-xs">
                           {analysis.breakdown.length} words
                         </span>
                      </span>
                      {openBreakdowns[index] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    
                    <AnimatePresence>
                      {openBreakdowns[index] && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                           <div className="p-5 pt-0 border-t border-zinc-100 dark:border-zinc-800/50 space-y-6">
                             
                             <div className="space-y-3 mt-4">
                                {analysis.breakdown.map((word, wIdx) => (
                                  <div key={wIdx} className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 p-3 rounded-xl hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50 transition-colors">
                                    <div className="sm:w-1/3 flex items-baseline gap-2 shrink-0">
                                      <span className="text-lg font-medium text-zinc-900 dark:text-white">{word.word}</span>
                                      <span className="text-sm text-indigo-600 dark:text-indigo-400">{word.pinyin}</span>
                                    </div>
                                    <div className="sm:w-2/3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-zinc-800 dark:text-zinc-200">{word.translation}</span>
                                        {word.pos && <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{word.pos}</span>}
                                      </div>
                                      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-snug">{word.definition}</p>
                                    </div>
                                  </div>
                                ))}
                             </div>

                             {(analysis.grammar || analysis.contextUsage) && (
                                <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800/50">
                                   {analysis.grammar && (
                                     <div>
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Grammar</h4>
                                        <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-indigo-50/50 dark:bg-indigo-900/10 p-3 rounded-xl">{analysis.grammar}</p>
                                     </div>
                                   )}
                                   {analysis.contextUsage && (
                                     <div>
                                       <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">Context Usage</h4>
                                       <p className="text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-xl">{analysis.contextUsage}</p>
                                     </div>
                                   )}
                                </div>
                             )}

                           </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                 </div>
              </motion.div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
