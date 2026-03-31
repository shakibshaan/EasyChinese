import React, { useState, useEffect } from 'react';
import { 
  Search, 
  Save, 
  BookOpen, 
  History, 
  ChevronLeft, 
  ChevronRight, 
  RotateCw, 
  CheckCircle,
  LogOut,
  LogIn,
  Trash2,
  BrainCircuit,
  X,
  AlertTriangle,
  Menu,
  FileText,
  Trophy,
  BookmarkPlus,
  CheckCircle2,
  Loader2,
  Home
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, getDocFromServer } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { analyzeSentence, SentenceAnalysis, WordBreakdown, SentenceToken, ContextExample } from './services/geminiService';
import { cn } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { Toaster, toast } from 'sonner';

// --- Types ---
interface SavedSentence extends SentenceAnalysis {
  id: string;
  userId: string;
  createdAt: any;
  isLearned?: boolean;
}

interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: any;
  isDefault?: boolean;
}

interface FlashcardData {
  id: string;
  folderId: string;
  front: string;
  back: string;
  pinyin?: string;
  tokens?: SentenceToken[];
  description?: string;
  userId: string;
  createdAt: any;
  lastTested?: any;
  difficulty?: number;
}

// --- Error Handling ---
enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, errorInfo: string | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorInfo: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, errorInfo: error.message };
  }

  render() {
    if (this.state.hasError) {
      let displayError = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.errorInfo || '');
        if (parsed.error) displayError = `Firestore Error: ${parsed.error} (${parsed.operationType} on ${parsed.path})`;
      } catch (e) {
        displayError = this.state.errorInfo || displayError;
      }

      return (
        <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 text-center space-y-6">
            <div className="w-16 h-16 bg-red-500/10 text-red-500 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={32} />
            </div>
            <h2 className="text-xl font-bold text-white">Application Error</h2>
            <p className="text-zinc-400 text-sm leading-relaxed">{displayError}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Components ---

const ThemeToggle = ({ theme, toggle }: { theme: 'dark' | 'light', toggle: () => void }) => (
  <button 
    onClick={toggle}
    className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all shadow-sm border border-zinc-200 dark:border-zinc-700"
  >
    {theme === 'dark' ? <RotateCw size={18} /> : <RotateCw size={18} className="rotate-180" />}
  </button>
);

const Auth = ({ user }: { user: User | null }) => {
  const login = () => signInWithPopup(auth, new GoogleAuthProvider());
  const logout = () => signOut(auth);

  if (user) {
    return (
      <div className="flex items-center gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
        <img src={user.photoURL || ''} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-zinc-300 dark:border-zinc-700" referrerPolicy="no-referrer" />
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-medium truncate dark:text-zinc-200">{user.displayName}</p>
          <p className="text-xs text-zinc-500 truncate dark:text-zinc-500">{user.email}</p>
        </div>
        <button onClick={logout} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500">
          <LogOut size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
      <button 
        onClick={login}
        className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-colors font-medium shadow-lg shadow-indigo-500/20"
      >
        <LogIn size={18} />
        Sign in with Google
      </button>
    </div>
  );
};

const renderTokenizedText = (text: string, tokens?: SentenceToken[], pinyin?: string, showPinyin: boolean = true, showChinese: boolean = true, size: 'sm' | 'lg' = 'lg') => {
  if (!tokens) {
    const actualShowChinese = showChinese || (!showChinese && !pinyin);
    return (
      <div className={cn("flex flex-col", size === 'lg' ? "items-center" : "items-start")}>
        {actualShowChinese && <span className={cn("font-serif leading-tight text-zinc-900 dark:text-white", size === 'lg' ? (showPinyin ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl") : "text-xl")}>{text}</span>}
        {showPinyin && pinyin && (
          <span className={cn("font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tighter", size === 'lg' ? (actualShowChinese ? "text-xs md:text-sm mt-1" : "text-2xl md:text-4xl") : "text-sm mt-0.5")}>
            {pinyin}
          </span>
        )}
      </div>
    );
  }
  
  return (
    <div className={cn("flex flex-wrap gap-x-1 md:gap-x-2 gap-y-2", size === 'lg' ? "justify-center md:gap-y-4" : "justify-start")}>
      {tokens.map((token, idx) => {
        const isPunctuation = !token.pinyin;
        const tokenShowChinese = showChinese || isPunctuation;
        return (
          <div key={idx} className="flex flex-col items-center justify-end">
            {tokenShowChinese && <span className={cn("font-serif text-zinc-900 dark:text-white leading-none", size === 'lg' ? (showPinyin && !isPunctuation ? "text-2xl md:text-4xl" : "text-3xl md:text-5xl") : "text-xl")}>{token.text}</span>}
            {showPinyin && token.pinyin && (
              <span className={cn("font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tighter", size === 'lg' ? (tokenShowChinese ? "text-xs md:text-sm mt-1" : "text-2xl md:text-4xl") : "text-sm mt-0.5")}>
                {token.pinyin}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const Flashcard = ({ card, onNext, onPrev, onDelete, total, current, pinyinMode, setPinyinMode }: { 
  card: FlashcardData | undefined; 
  onNext: () => void; 
  onPrev: () => void;
  onDelete?: (id: string) => void;
  total: number;
  current: number;
  pinyinMode: boolean;
  setPinyinMode: (mode: boolean) => void;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);

  useEffect(() => {
    setIsFlipped(false);
  }, [card]);

  if (!card) return null;

  const isFrontChinese = !card.front.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/);
  const chineseText = isFrontChinese ? card.front : card.back;
  const englishText = isFrontChinese ? card.back : card.front;

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end mb-4">
        <label className="flex items-center cursor-pointer gap-2 select-none">
          <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Pinyin Mode</span>
          <div className="relative">
            <input type="checkbox" className="sr-only" checked={pinyinMode} onChange={() => setPinyinMode(!pinyinMode)} />
            <div className={cn("block w-10 h-6 rounded-full transition-colors", pinyinMode ? "bg-indigo-500" : "bg-zinc-300 dark:bg-zinc-700")}></div>
            <div className={cn("dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform", pinyinMode ? "transform translate-x-4" : "")}></div>
          </div>
        </label>
      </div>

      <div className="flex-1 perspective-1000">
        <motion.div 
          className="relative w-full h-full transition-all duration-500 preserve-3d cursor-pointer"
          animate={{ rotateY: isFlipped ? 180 : 0 }}
          onClick={() => setIsFlipped(!isFlipped)}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl shadow-indigo-500/5 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 md:p-8 scrollbar-hide">
              <div className="min-h-full flex flex-col items-center justify-center py-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-4 md:mb-6">Question</span>
                <div className="w-full flex justify-center">
                  {renderTokenizedText(chineseText, card.tokens, card.pinyin, pinyinMode, !pinyinMode)}
                </div>
              </div>
            </div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl rotate-y-180 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 md:p-8 scrollbar-hide">
              <div className="min-h-full flex flex-col items-center justify-center py-4">
                <div className="mb-4 w-full flex flex-col items-center">
                  {renderTokenizedText(chineseText, card.tokens, card.pinyin, true, true)}
                  <p className="text-xl md:text-2xl font-serif text-zinc-800 dark:text-zinc-200 mt-4 text-center">{englishText}</p>
                </div>

                {card.description && (
                  <div className="w-full text-left bg-white dark:bg-zinc-900 p-3 md:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 mt-2">
                    <p className="text-xs md:text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{card.description}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <div className="flex gap-1 md:gap-2">
          <button onClick={onPrev} className="p-3 md:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors dark:text-zinc-400">
            <ChevronLeft size={24} className="md:w-6 md:h-6" />
          </button>
          <button onClick={onNext} className="p-3 md:p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors dark:text-zinc-400">
            <ChevronRight size={24} className="md:w-6 md:h-6" />
          </button>
          {onDelete && (
            <button 
              onClick={() => card && onDelete(card.id)} 
              className="p-3 md:p-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-full transition-colors"
              title="Delete Flashcard"
            >
              <Trash2 size={20} className="md:w-5 md:h-5" />
            </button>
          )}
        </div>
        <div className="text-sm font-medium text-zinc-500 dark:text-zinc-500">
          {current + 1} / {total}
        </div>
        <button onClick={() => setIsFlipped(!isFlipped)} className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-200 hover:underline p-2">
          <RotateCw size={16} />
          Flip
        </button>
      </div>
    </div>
  );
};

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

interface SidebarProps {
  user: User | null;
  folders: Folder[];
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  flashcards: FlashcardData[];
  setFlashcardIndex: (index: number) => void;
  setViewMode: (mode: 'analysis' | 'flashcards' | 'test' | 'results') => void;
  setIsSidebarOpen: (open: boolean) => void;
  isAddingFolder: boolean;
  setIsAddingFolder: (adding: boolean) => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  handleCreateFolder: () => void;
  folderToDelete: string | null;
  setFolderToDelete: (id: string | null) => void;
  sentenceToDelete: string | null;
  setSentenceToDelete: (id: string | null) => void;
  handleDeleteFolder: (id: string) => void;
  recentAnalyses: SentenceAnalysis[];
  setRecentAnalyses: React.Dispatch<React.SetStateAction<SentenceAnalysis[]>>;
  savedSentences: SavedSentence[];
  setAnalysis: (analysis: SentenceAnalysis) => void;
}

const SidebarContent = ({
  user,
  folders,
  activeFolderId,
  setActiveFolderId,
  flashcards,
  setFlashcardIndex,
  setViewMode,
  setIsSidebarOpen,
  isAddingFolder,
  setIsAddingFolder,
  newFolderName,
  setNewFolderName,
  handleCreateFolder,
  folderToDelete,
  setFolderToDelete,
  sentenceToDelete,
  setSentenceToDelete,
  handleDeleteFolder,
  recentAnalyses,
  setRecentAnalyses,
  savedSentences,
  setAnalysis
}: SidebarProps) => (
  <>
    <Auth user={user} />
    
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-4 space-y-8">
        {/* Folders Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 font-bold">Folders</h3>
            <button onClick={() => setIsAddingFolder(true)} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline uppercase tracking-wider p-2 -mr-2">+ New Folder</button>
          </div>

          {isAddingFolder && (
            <div className="mb-4 space-y-2 p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-800">
              <input 
                autoFocus
                value={newFolderName}
                maxLength={30}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateFolder()}
                placeholder="Folder name..."
                className="w-full p-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-1 focus:ring-indigo-500 outline-none"
              />
              <div className="flex gap-2">
                <button onClick={handleCreateFolder} className="flex-1 py-2 text-xs bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-all">Add</button>
                <button onClick={() => setIsAddingFolder(false)} className="flex-1 py-2 text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-all">Cancel</button>
              </div>
            </div>
          )}
          
          <div className="space-y-1">
            {[...folders].sort((a, b) => {
              if (a.isDefault) return -1;
              if (b.isDefault) return 1;
              
              // Sort non-default folders by creation time (ascending)
              const aTime = a.createdAt?.toMillis?.() || 0;
              const bTime = b.createdAt?.toMillis?.() || 0;
              return aTime - bTime;
            }).map(f => (
              <div key={f.id} className="group relative">
                <div 
                  onClick={() => { 
                    setActiveFolderId(f.id); 
                    setFlashcardIndex(0);
                    setViewMode('flashcards');
                    if (window.innerWidth < 1024) setIsSidebarOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3 rounded-xl transition-all text-sm cursor-pointer",
                    activeFolderId === f.id ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <BookOpen size={16} />
                    <span className="font-medium truncate max-w-[140px]">{f.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold opacity-60">{flashcards.filter(c => c.folderId === f.id).length}</span>
                    {!f.isDefault && (
                      <div className="flex items-center">
                        {folderToDelete === f.id ? (
                          <div className="flex items-center gap-1 bg-red-500 rounded-lg p-1 shadow-lg">
                            <button 
                              onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id); }}
                              className="text-[10px] md:text-xs font-bold text-white px-2 py-1 hover:underline"
                            >
                              Confirm
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setFolderToDelete(null); }}
                              className="p-1 text-white/70 hover:text-white"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setFolderToDelete(f.id); }}
                            className="p-3 md:p-1.5 hover:bg-white/20 rounded-lg transition-all"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Library Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 font-bold">Recent Analysis</h3>
          </div>
          <div className="space-y-2">
            {/* Merge recentAnalyses and savedSentences, avoiding duplicates */}
            {(() => {
              const merged = [...recentAnalyses];
              savedSentences.forEach(s => {
                if (!merged.find(m => m.originalText === s.originalText)) {
                  merged.push(s);
                }
              });
              return merged.slice(0, 8).map((s, idx) => {
                const isSaved = savedSentences.some(ss => ss.originalText === s.originalText);
                const savedId = savedSentences.find(ss => ss.originalText === s.originalText)?.id;
                
                return (
                  <div 
                    key={savedId || `recent-${idx}`}
                    className="p-3 rounded-xl border border-transparent hover:border-zinc-200 dark:hover:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer transition-all group relative"
                  >
                    <div 
                      className="flex items-start gap-2 pr-8"
                      onClick={() => { 
                        setAnalysis(s); 
                        setViewMode('analysis'); 
                        if (window.innerWidth < 1024) setIsSidebarOpen(false);
                      }}
                    >
                      <FileText size={12} className={cn("mt-0.5 transition-colors", isSaved ? "text-indigo-500" : "text-zinc-400 group-hover:text-indigo-500")} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-serif line-clamp-1 mb-1 dark:text-zinc-300">{s.originalText}</p>
                        <p className="text-[10px] text-zinc-500 line-clamp-1">{s.translatedText}</p>
                      </div>
                    </div>
                    {isSaved && savedId && (
                      <div className="absolute right-1 md:right-2 top-1/2 -translate-y-1/2 flex items-center">
                        {sentenceToDelete === savedId ? (
                          <div className="flex items-center gap-1 bg-red-500 rounded-lg p-1 shadow-lg z-10">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteDoc(doc(db, 'sentences', savedId)).then(() => {
                                  setRecentAnalyses(prev => prev.filter(a => a.originalText !== s.originalText));
                                  toast.success("Sentence deleted");
                                  setSentenceToDelete(null);
                                });
                              }}
                              className="text-[10px] md:text-xs font-bold text-white px-2 py-1 hover:underline"
                            >
                              Confirm
                            </button>
                            <button 
                              onClick={(e) => { e.stopPropagation(); setSentenceToDelete(null); }}
                              className="p-1 text-white/70 hover:text-white"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => { e.stopPropagation(); setSentenceToDelete(savedId); }}
                            className="p-3 md:p-1.5 text-zinc-400 hover:text-red-500 transition-all"
                            title="Delete Sentence"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    )}
                    {!isSaved && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setRecentAnalyses(prev => prev.filter(a => a.originalText !== s.originalText));
                          toast.success("Removed from history");
                        }}
                        className="absolute right-1 md:right-2 top-1/2 -translate-y-1/2 p-3 md:p-1.5 text-zinc-400 hover:text-red-500 transition-all"
                        title="Remove from History"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      </div>
    </div>
  </>
);

const LoadingScreen = () => (
  <div className="fixed inset-0 bg-zinc-950 flex flex-col items-center justify-center z-[100]">
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center"
    >
      <div className="relative mb-8">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 border-4 border-rose-500/20 border-t-rose-500 rounded-full"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-rose-500 animate-spin" />
        </div>
      </div>
      <h2 className="text-2xl font-serif font-bold text-white mb-2">EasyChinese</h2>
      <p className="text-zinc-400 font-mono text-xs uppercase tracking-widest animate-pulse">Initializing Experience...</p>
    </motion.div>
  </div>
);

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SentenceAnalysis | null>(null);
  const [savedSentences, setSavedSentences] = useState<SavedSentence[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardData[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'analysis' | 'flashcards' | 'test' | 'results'>('analysis');
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [pinyinMode, setPinyinMode] = useState(false);
  const [testPile, setTestPile] = useState<FlashcardData[]>([]);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState({
    sentences: false,
    folders: false,
    flashcards: false
  });
  const [recentAnalyses, setRecentAnalyses] = useState<SentenceAnalysis[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [incorrectCount, setIncorrectCount] = useState(0);
  const [testTotal, setTestTotal] = useState(0);
  const [firstAttemptCorrect, setFirstAttemptCorrect] = useState(0);
  const [newFolderName, setNewFolderName] = useState('');
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [sentenceToDelete, setSentenceToDelete] = useState<string | null>(null);
  const creatingDefaultFolder = React.useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) {
        setIsDataReady(true);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (isAuthReady && user) {
      if (dataLoaded.sentences && dataLoaded.folders && dataLoaded.flashcards) {
        setIsDataReady(true);
      }
    }
  }, [isAuthReady, user, dataLoaded]);

  // Test connection
  useEffect(() => {
    if (!isAuthReady || !user) return;
    
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
        // We don't throw here to avoid blocking the app if just the test fails
      }
    };
    testConnection();
  }, [isAuthReady, user]);

  useEffect(() => {
    if (!user) {
      setSavedSentences([]);
      setFolders([]);
      setFlashcards([]);
      return;
    }

    // Sentences
    const qSentences = query(collection(db, 'sentences'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubSentences = onSnapshot(qSentences, 
      (s) => {
        setSavedSentences(s.docs.map(d => ({ ...d.data(), id: d.id })) as SavedSentence[]);
        setDataLoaded(prev => ({ ...prev, sentences: true }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'sentences')
    );

    // Folders
    const qFolders = query(collection(db, 'folders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const unsubFolders = onSnapshot(qFolders, 
      (s) => {
        const folderList = s.docs.map(d => ({ ...d.data(), id: d.id })) as Folder[];
        setFolders(folderList);
        if (folderList.length > 0 && !activeFolderId) {
          setActiveFolderId(folderList.find(f => f.isDefault)?.id || folderList[0].id);
        }
        setDataLoaded(prev => ({ ...prev, folders: true }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'folders')
    );

    // Flashcards
    const qCards = query(collection(db, 'flashcards'), where('userId', '==', user.uid));
    const unsubCards = onSnapshot(qCards, 
      (s) => {
        setFlashcards(s.docs.map(d => ({ ...d.data(), id: d.id })) as FlashcardData[]);
        setDataLoaded(prev => ({ ...prev, flashcards: true }));
      },
      (error) => handleFirestoreError(error, OperationType.GET, 'flashcards')
    );

    return () => { unsubSentences(); unsubFolders(); unsubCards(); };
  }, [user]);

  // Create default folder if not exists
  useEffect(() => {
    if (user && isAuthReady && folders.length === 0 && !creatingDefaultFolder.current) {
      const createDefault = async () => {
        creatingDefaultFolder.current = true;
        try {
          await addDoc(collection(db, 'folders'), {
            name: 'Saved Sentences',
            userId: user.uid,
            createdAt: serverTimestamp(),
            isDefault: true
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.WRITE, 'folders');
        } finally {
          creatingDefaultFolder.current = false;
        }
      };
      createDefault();
    }
  }, [user, folders, isAuthReady]);

  // Cleanup duplicate "Saved Sentences" folders
  useEffect(() => {
    if (!user || folders.length <= 1) return;

    const cleanupDuplicates = async () => {
      const savedSentenceFolders = folders.filter(f => f.name === 'Saved Sentences');
      if (savedSentenceFolders.length <= 1) return;

      // Identify the best folder to keep:
      // 1. Prefer the one marked as isDefault
      // 2. Otherwise, prefer the one with the most flashcards
      // 3. Otherwise, prefer the oldest one (by createdAt)
      const sortedFolders = [...savedSentenceFolders].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        
        const aCards = flashcards.filter(c => c.folderId === a.id).length;
        const bCards = flashcards.filter(c => c.folderId === b.id).length;
        if (aCards !== bCards) return bCards - aCards;

        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return aTime - bTime;
      });

      const [keepFolder, ...toDelete] = sortedFolders;

      // Ensure the one we keep is marked as default if it's the primary "Saved Sentences" folder
      if (!keepFolder.isDefault) {
        try {
          await updateDoc(doc(db, 'folders', keepFolder.id), { isDefault: true });
        } catch (error) {
          console.error("Failed to mark folder as default:", keepFolder.id, error);
        }
      }

      // Delete the duplicates
      for (const folder of toDelete) {
        try {
          // Move cards to the keepFolder instead of deleting them?
          // Actually, the user said "remove these duplicates", so they probably want them gone.
          // But to be safe, let's move cards if they are unique? 
          // No, usually duplicates are exact copies. Let's just delete them to be clean.
          const folderCards = flashcards.filter(c => c.folderId === folder.id);
          for (const card of folderCards) {
            await deleteDoc(doc(db, 'flashcards', card.id));
          }
          await deleteDoc(doc(db, 'folders', folder.id));
        } catch (error) {
          console.error("Cleanup failed for folder:", folder.id, error);
        }
      }
    };

    cleanupDuplicates();
  }, [user, folders, flashcards]);

  useEffect(() => {
    const saved = localStorage.getItem('hanzi_flow_recent_analyses_v4');
    if (saved) {
      try {
        setRecentAnalyses(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load recent analyses:", e);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('hanzi_flow_recent_analyses_v4', JSON.stringify(recentAnalyses.slice(0, 10)));
  }, [recentAnalyses]);

  const handleAnalyze = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isAnalyzing) return;
    
    // Check word count to prevent spamming/huge requests
    const wordCount = inputText.trim().split(/\s+/).length;
    if (wordCount > 20) {
      toast.error("Please limit your text to 20 words or less.");
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);
    setViewMode('analysis');
    try {
      const result = await analyzeSentence(inputText);
      setAnalysis(result);
      
      // Add to recent analyses if not already there
      setRecentAnalyses(prev => {
        const filtered = prev.filter(a => a.originalText !== result.originalText);
        return [result, ...filtered].slice(0, 10);
      });
    } catch (error) {
      console.error("Analysis failed:", error);
      toast.error("Analysis failed. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSave = async () => {
    if (!user || !analysis) return;
    try {
      const defaultFolder = folders.find(f => f.isDefault);
      if (!defaultFolder) {
        toast.error("Default folder not found.");
        return;
      }

      // Check for duplicates in the default folder
      const existingFlashcard = flashcards.find(c => 
        c.folderId === defaultFolder.id && 
        c.front === analysis.originalText
      );

      const existingSentence = savedSentences.find(s => 
        s.originalText === analysis.originalText
      );

      if (existingFlashcard || existingSentence) {
        // Unsave
        if (existingFlashcard) {
          await deleteDoc(doc(db, 'flashcards', existingFlashcard.id));
        }
        if (existingSentence) {
          await deleteDoc(doc(db, 'sentences', existingSentence.id));
        }
        toast.success("Removed from library");
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id: _id, ...analysisData } = analysis as any;

      await addDoc(collection(db, 'sentences'), {
        ...analysisData,
        userId: user.uid,
        createdAt: serverTimestamp(),
        isLearned: false
      });

      // Also add to default folder as a flashcard
      await addDoc(collection(db, 'flashcards'), {
        folderId: defaultFolder.id,
        front: analysis.originalText,
        back: analysis.translatedText,
        pinyin: analysis.pinyin || '',
        tokens: analysis.tokens || null,
        description: `${analysis.grammar}\n\n---\n\n${analysis.contextUsage}\n\n${analysis.contextExamples?.map(ex => `${ex.text} (${ex.pinyin} - ${ex.translation})`).join('\n') || ''}`,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      
      toast.success("Sentence saved to library!");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sentences/flashcards');
      toast.error("Failed to save sentence.");
    }
  };

  const handleSaveWord = async (word: WordBreakdown) => {
    if (!user) return;
    try {
      const defaultFolder = folders.find(f => f.isDefault);
      const folderId = activeFolderId || defaultFolder?.id;
      if (!folderId) {
        toast.error("No folder found to save the word.");
        return;
      }

      // Check for duplicates in the target folder
      const existingFlashcard = flashcards.find(c => 
        c.folderId === folderId && 
        c.front === word.word
      );

      if (existingFlashcard) {
        // Unsave
        await deleteDoc(doc(db, 'flashcards', existingFlashcard.id));
        toast.success(`"${word.word}" removed from flashcards`);
        return;
      }

      await addDoc(collection(db, 'flashcards'), {
        folderId,
        front: word.word,
        back: word.translation,
        pinyin: word.pinyin || '',
        description: word.definition,
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      toast.success(`"${word.word}" saved to flashcards!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcards');
      toast.error("Failed to save word.");
    }
  };

  const handleSaveExample = async (example: ContextExample) => {
    if (!user) return;
    try {
      const defaultFolder = folders.find(f => f.isDefault);
      const folderId = activeFolderId || defaultFolder?.id;
      if (!folderId) {
        toast.error("No folder found to save the example.");
        return;
      }

      // Check for duplicates in the target folder
      const existingFlashcard = flashcards.find(c => 
        c.folderId === folderId && 
        c.front === example.text
      );

      if (existingFlashcard) {
        // Unsave
        await deleteDoc(doc(db, 'flashcards', existingFlashcard.id));
        toast.success(`Example removed from flashcards`);
        return;
      }

      await addDoc(collection(db, 'flashcards'), {
        folderId,
        front: example.text,
        back: example.translation,
        pinyin: example.pinyin || '',
        userId: user.uid,
        createdAt: serverTimestamp()
      });

      toast.success(`Example saved to flashcards!`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'flashcards');
      toast.error("Failed to save example.");
    }
  };

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    
    if (newFolderName.trim().length > 30) {
      toast.error("Folder name must be 30 characters or less.");
      return;
    }
    
    try {
      await addDoc(collection(db, 'folders'), {
        name: newFolderName,
        userId: user.uid,
        createdAt: serverTimestamp(),
        isDefault: false
      });
      setNewFolderName('');
      setIsAddingFolder(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'folders');
    }
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !activeFolderId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      for (const line of lines) {
        const [front, back, pinyin, description] = line.split(',').map(s => s.trim());
        if (front && back) {
          try {
            await addDoc(collection(db, 'flashcards'), {
              folderId: activeFolderId,
              front,
              back,
              pinyin: pinyin || '',
              description: description || '',
              userId: user.uid,
              createdAt: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, 'flashcards');
          }
        }
      }
    };
    reader.readAsText(file);
  };

  const startTest = () => {
    const folderCards = flashcards.filter(c => c.folderId === activeFolderId);
    if (folderCards.length === 0) return;
    setTestPile([...folderCards]);
    setFlashcardIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setFirstAttemptCorrect(0);
    setTestTotal(folderCards.length);
    setViewMode('test');
  };

  const handleTestMark = (remembered: boolean) => {
    const currentCard = testPile[flashcardIndex];
    
    // Track if this is the first time we're seeing this specific card in this test session
    // We can use the index to track this, but since we append to the end, 
    // we need to know if the original index was already attempted.
    // Actually, simpler: just track if flashcardIndex < testTotal
    if (flashcardIndex < testTotal) {
      if (remembered) {
        setFirstAttemptCorrect(prev => prev + 1);
      }
    }

    if (remembered) {
      setCorrectCount(prev => prev + 1);
    } else {
      setIncorrectCount(prev => prev + 1);
      // Add to end of pile to re-test
      setTestPile(prev => [...prev, currentCard]);
    }

    if (flashcardIndex < testPile.length - 1) {
      setFlashcardIndex(prev => prev + 1);
    } else {
      setViewMode('results');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!user) return;
    
    const folder = folders.find(f => f.id === folderId);
    if (folder?.isDefault) return;

    try {
      // Delete all flashcards in this folder
      const folderCards = flashcards.filter(c => c.folderId === folderId);
      for (const card of folderCards) {
        await deleteDoc(doc(db, 'flashcards', card.id));
      }

      // Delete the folder
      await deleteDoc(doc(db, 'folders', folderId));

      // Reset active folder if deleted
      if (activeFolderId === folderId) {
        const defaultFolder = folders.find(f => f.isDefault);
        setActiveFolderId(defaultFolder?.id || folders[0]?.id || null);
      }
      setFolderToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'folders/flashcards');
    }
  };

  const activeFolderCards = flashcards.filter(c => c.folderId === activeFolderId);
  const isCurrentAnalysisSaved = analysis && savedSentences.some(s => s.originalText === analysis.originalText);

return (
  <>
    <AnimatePresence>
      {!isDataReady && <LoadingScreen key="loading" />}
    </AnimatePresence>
    <div className={cn("flex h-[100dvh] overflow-hidden transition-colors duration-300", theme === 'dark' ? "bg-zinc-950 text-zinc-100 dark" : "bg-zinc-50 text-zinc-900")}>
      <Toaster position="bottom-right" richColors />
      {/* Sidebar - Desktop */}
      <motion.aside 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="hidden lg:flex h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex-col shadow-xl z-20 overflow-hidden"
      >
        <SidebarContent 
          user={user}
          folders={folders}
          activeFolderId={activeFolderId}
          setActiveFolderId={setActiveFolderId}
          flashcards={flashcards}
          setFlashcardIndex={setFlashcardIndex}
          setViewMode={setViewMode}
          setIsSidebarOpen={setIsSidebarOpen}
          isAddingFolder={isAddingFolder}
          setIsAddingFolder={setIsAddingFolder}
          newFolderName={newFolderName}
          setNewFolderName={setNewFolderName}
          handleCreateFolder={handleCreateFolder}
          folderToDelete={folderToDelete}
          setFolderToDelete={setFolderToDelete}
          sentenceToDelete={sentenceToDelete}
          setSentenceToDelete={setSentenceToDelete}
          handleDeleteFolder={handleDeleteFolder}
          recentAnalyses={recentAnalyses}
          setRecentAnalyses={setRecentAnalyses}
          savedSentences={savedSentences}
          setAnalysis={setAnalysis}
        />
      </motion.aside>

      {/* Sidebar - Mobile Drawer */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.div 
            key="swipe-edge"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="lg:hidden fixed left-0 top-0 bottom-0 w-8 z-40"
            onPan={(e, info) => {
              if (info.offset.x > 40) {
                setIsSidebarOpen(true);
              }
            }}
          />
        )}
        {isSidebarOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.aside 
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed inset-y-0 left-0 w-[280px] bg-white dark:bg-zinc-900 z-50 flex flex-col shadow-2xl border-r border-zinc-200 dark:border-zinc-800"
            >
              <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800">
                <h1 className="text-lg font-serif font-bold text-rose-500 dark:text-rose-400">EasyChinese</h1>
                <button onClick={() => setIsSidebarOpen(false)} className="p-3 -mr-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg">
                  <X size={20} />
                </button>
              </div>
              <SidebarContent 
                user={user}
                folders={folders}
                activeFolderId={activeFolderId}
                setActiveFolderId={setActiveFolderId}
                flashcards={flashcards}
                setFlashcardIndex={setFlashcardIndex}
                setViewMode={setViewMode}
                setIsSidebarOpen={setIsSidebarOpen}
                isAddingFolder={isAddingFolder}
                setIsAddingFolder={setIsAddingFolder}
                newFolderName={newFolderName}
                setNewFolderName={setNewFolderName}
                handleCreateFolder={handleCreateFolder}
                folderToDelete={folderToDelete}
                setFolderToDelete={setFolderToDelete}
                sentenceToDelete={sentenceToDelete}
                setSentenceToDelete={setSentenceToDelete}
                handleDeleteFolder={handleDeleteFolder}
                recentAnalyses={recentAnalyses}
                setRecentAnalyses={setRecentAnalyses}
                savedSentences={savedSentences}
                setAnalysis={setAnalysis}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {/* Header */}
        <header className="sticky top-0 h-14 md:h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-3 md:px-6 shrink-0 z-30">
          <div className="flex items-center gap-2 md:gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-3 md:p-2 -ml-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <Menu size={18} className="text-zinc-600 dark:text-zinc-400" />
            </button>
            <h1 className="text-sm md:text-lg font-serif font-bold tracking-tight text-rose-500 dark:text-rose-400">EasyChinese</h1>
          </div>
          
          <div className="flex items-center gap-2 md:gap-4">
            <ThemeToggle theme={theme} toggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
            {viewMode !== 'analysis' && (
              <button 
                onClick={() => setViewMode('analysis')}
                className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border-2 border-rose-500/20 dark:border-rose-400/20 bg-rose-500/5 dark:bg-rose-400/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-400 dark:hover:text-zinc-950 transition-all flex items-center gap-2 text-xs md:text-sm font-bold"
              >
                <Home size={16} />
                Back
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 md:p-8">
            <AnimatePresence mode="wait">
              {viewMode === 'analysis' ? (
                <motion.div 
                  key="analysis"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-12"
                >
                  {/* Input Section */}
                  <section className="space-y-4">
                    <form onSubmit={handleAnalyze} className="relative">
                      <input 
                        type="text"
                        value={inputText}
                        maxLength={300}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAnalyze(e);
                          }
                        }}
                        enterKeyHint="go"
                        placeholder="Paste Chinese or English text (max 20 words)..."
                        className="w-full h-14 md:h-20 pl-6 md:pl-8 pr-16 md:pr-20 bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl shadow-xl shadow-indigo-500/5 focus:border-indigo-500 dark:focus:border-indigo-500 focus:ring-0 transition-all text-base md:text-xl font-serif dark:text-white"
                      />
                      <button 
                        type="submit"
                        disabled={isAnalyzing || !inputText.trim()}
                        className="absolute right-2 md:right-4 top-2 md:top-4 w-10 md:w-12 h-10 md:h-12 bg-indigo-600 text-white rounded-xl md:rounded-2xl flex items-center justify-center hover:bg-indigo-500 disabled:bg-zinc-200 dark:disabled:bg-zinc-800 disabled:cursor-not-allowed transition-all shadow-lg shadow-indigo-500/30"
                      >
                        {isAnalyzing ? <RotateCw className="animate-spin" size={20} /> : <Search size={20} />}
                      </button>
                    </form>
                  </section>

                  {/* Results Section */}
                  {isAnalyzing && (
                    <div className="space-y-6 md:space-y-10">
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <RotateCw className="w-8 h-8 md:w-10 md:h-10 text-indigo-500 animate-spin" />
                        <p className="text-sm md:text-base font-medium text-zinc-500 dark:text-zinc-400 animate-pulse">Analyzing please wait...</p>
                      </div>
                      <div className="space-y-6 md:space-y-10 animate-pulse opacity-50">
                        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm">
                        <div className="h-4 w-24 bg-zinc-100 dark:bg-zinc-800 rounded mb-4 md:mb-6" />
                        <div className="space-y-3 md:space-y-4">
                          <div className="h-8 md:h-12 w-3/4 bg-zinc-100 dark:bg-zinc-800 rounded-lg md:rounded-xl" />
                          <div className="h-6 md:h-8 w-1/2 bg-zinc-100 dark:bg-zinc-800 rounded-lg md:rounded-xl" />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                        <div className="space-y-3 md:space-y-4">
                          <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded" />
                          <div className="space-y-2">
                            {[1, 2, 3].map(i => (
                              <div key={i} className="h-16 md:h-20 bg-zinc-100 dark:bg-zinc-800 rounded-xl md:rounded-2xl" />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-3 md:space-y-4">
                          <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded" />
                          <div className="h-32 md:h-40 bg-zinc-100 dark:bg-zinc-800 rounded-2xl md:rounded-3xl" />
                        </div>
                      </div>
                    </div>
                    </div>
                  )}

                  {analysis && !isAnalyzing && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 md:space-y-10">
                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl md:rounded-3xl p-4 md:p-8 shadow-sm">
                        <div className="flex items-center justify-between mb-4 md:mb-6">
                           <span className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600">Translation</span>
                           {user && (
                             <button 
                               onClick={handleSave} 
                               className={cn(
                                 "flex items-center gap-1.5 md:gap-2 text-[10px] md:text-sm font-bold transition-all px-4 md:px-4 py-3 md:py-2 rounded-lg md:rounded-xl",
                                 isCurrentAnalysisSaved 
                                   ? "text-green-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30" 
                                   : "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 hover:bg-indigo-100 dark:hover:bg-indigo-900/30"
                               )}
                               title={isCurrentAnalysisSaved ? "Remove from Library" : "Save to Library"}
                             >
                               {isCurrentAnalysisSaved ? (
                                 <>
                                   <CheckCircle2 size={14} className="md:w-4 md:h-4" />
                                   <span className="hidden xs:inline">Saved to Library</span>
                                   <span className="xs:hidden">Saved</span>
                                 </>
                               ) : (
                                 <>
                                   <BookmarkPlus size={14} className="md:w-4 md:h-4" />
                                   <span className="hidden xs:inline">Save & Create Flashcard</span>
                                   <span className="xs:hidden">Save</span>
                                 </>
                               )}
                             </button>
                           )}
                         </div>
                         <div className="space-y-6 md:space-y-8">
                           <div>
                             {/* If original text is Chinese (not English-like) and we have tokens */}
                             {analysis.tokens && !analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) ? (
                               <div className="flex flex-wrap gap-x-2 md:gap-x-4 gap-y-4 md:gap-y-8 mb-4">
                                 {analysis.tokens.map((token, idx) => (
                                   <div key={idx} className="flex flex-col items-center">
                                     <span className="text-2xl md:text-4xl font-serif text-zinc-900 dark:text-white leading-none">{token.text}</span>
                                     {token.pinyin && (
                                       <span className="text-xs md:text-base font-medium text-indigo-600 dark:text-indigo-400 mt-2 md:mt-3 font-sans lowercase tracking-tighter">
                                         {token.pinyin}
                                       </span>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             ) : (
                               <h2 className="text-2xl md:text-4xl font-serif text-zinc-900 dark:text-white mb-2 leading-tight">{analysis.originalText}</h2>
                             )}
                           </div>
                           
                           <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full" />
                           
                           <div>
                             {/* If translated text is Chinese (original IS English-like) and we have tokens */}
                             {analysis.tokens && analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) ? (
                               <div className="flex flex-wrap gap-x-2 md:gap-x-4 gap-y-4 md:gap-y-8">
                                 {analysis.tokens.map((token, idx) => (
                                   <div key={idx} className="flex flex-col items-center">
                                     <span className="text-2xl md:text-4xl font-serif text-zinc-900 dark:text-white leading-none">{token.text}</span>
                                     {token.pinyin && (
                                       <span className="text-xs md:text-base font-medium text-indigo-600 dark:text-indigo-400 mt-2 md:mt-3 font-sans lowercase tracking-tighter">
                                         {token.pinyin}
                                       </span>
                                     )}
                                   </div>
                                 ))}
                               </div>
                             ) : (
                               <p className="text-lg md:text-2xl text-zinc-600 dark:text-zinc-400 font-serif italic">{analysis.translatedText}</p>
                             )}
                           </div>
                         </div>
                       </div>

                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-10">
                        <div className="lg:col-span-2 space-y-4">
                          <h3 className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 px-1">Breakdown</h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                            {analysis.breakdown.map((item, idx) => {
                              const isSaved = flashcards.some(c => 
                                c.folderId === (activeFolderId || folders.find(f => f.isDefault)?.id) && 
                                c.front === item.word
                              );
                              return (
                                <div key={idx} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl md:rounded-2xl p-4 md:p-6 hover:border-indigo-500 transition-colors relative group shadow-sm">
                                  <div className="flex justify-between items-start mb-3 md:mb-4">
                                    <div className="flex items-baseline gap-2 md:gap-3">
                                      <span className="text-xl md:text-3xl font-serif font-bold text-zinc-900 dark:text-white">{item.word}</span>
                                      {item.pinyin && <span className="text-base md:text-lg font-medium text-indigo-600 dark:text-indigo-400 lowercase">{item.pinyin}</span>}
                                    </div>
                                    {user && (
                                      <button 
                                        onClick={() => handleSaveWord(item)}
                                        className={cn(
                                          "p-3 md:p-2.5 rounded-lg md:rounded-2xl transition-all shadow-sm",
                                          isSaved 
                                            ? "text-green-500 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30" 
                                            : "text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800"
                                        )}
                                        title={isSaved ? "Remove from Flashcards" : "Save to Flashcards"}
                                      >
                                        {isSaved ? <CheckCircle2 size={16} className="md:w-5 md:h-5" /> : <BookmarkPlus size={16} className="md:w-5 md:h-5" />}
                                      </button>
                                    )}
                                  </div>
                                  <p className="text-sm md:text-base font-medium text-zinc-800 dark:text-zinc-200 mb-1">{item.translation}</p>
                                  <p className="text-[10px] md:text-xs text-zinc-500 dark:text-zinc-500 leading-relaxed">{item.definition}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="space-y-6">
                          <div className="space-y-3">
                            <h3 className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 px-1">Grammar</h3>
                            <div className="prose prose-sm md:prose-base prose-zinc dark:prose-invert max-w-none bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl md:rounded-3xl p-4 md:p-8 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 whitespace-pre-wrap">
                              <ReactMarkdown>{analysis.grammar}</ReactMarkdown>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <h3 className="text-[10px] md:text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 px-1">Context</h3>
                            <div className="bg-zinc-100/50 dark:bg-zinc-900/50 rounded-2xl md:rounded-3xl p-4 md:p-8 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-800 space-y-6">
                              {analysis.contextUsage && (
                                <p className="text-sm md:text-base leading-relaxed whitespace-pre-wrap">{analysis.contextUsage}</p>
                              )}
                              
                              {analysis.contextExamples && analysis.contextExamples.length > 0 && (
                                <div className="space-y-6 pt-2">
                                  {analysis.contextExamples.map((ex, idx) => {
                                    const isSaved = flashcards.some(c => c.front === ex.text && (activeFolderId ? c.folderId === activeFolderId : true));
                                    return (
                                      <div key={idx} className="space-y-3 relative group/ex">
                                        <div className="flex justify-between items-start">
                                          <div className="flex flex-wrap gap-x-3 gap-y-2">
                                            <div className="flex flex-col items-start">
                                              <span className="text-xl md:text-2xl font-serif text-zinc-900 dark:text-white leading-none">{ex.text}</span>
                                              <span className="text-xs md:text-sm font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tight mt-1">
                                                {ex.pinyin}
                                              </span>
                                            </div>
                                          </div>
                                          <button 
                                            onClick={() => handleSaveExample(ex)}
                                            className={cn(
                                              "p-2 rounded-xl transition-all",
                                              isSaved 
                                                ? "text-green-500 bg-green-50 dark:bg-green-900/20" 
                                                : "text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                            )}
                                            title={isSaved ? "Remove from Flashcards" : "Save to Flashcards"}
                                          >
                                            {isSaved ? <CheckCircle2 size={16} /> : <BookmarkPlus size={16} />}
                                          </button>
                                        </div>
                                        <div className="space-y-1">
                                          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 italic">
                                            {ex.translation}
                                          </p>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              
                              {/* Fallback for old data */}
                              {(!analysis.contextUsage && !analysis.contextExamples) && (analysis as any).context && (
                                <div className="prose prose-sm md:prose-base prose-zinc dark:prose-invert max-w-none whitespace-pre-wrap">
                                  <ReactMarkdown>{(analysis as any).context}</ReactMarkdown>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              ) : viewMode === 'flashcards' ? (
                <motion.div key="flashcards" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-serif font-bold dark:text-white">{folders.find(f => f.id === activeFolderId)?.name}</h2>
                      <p className="text-sm text-zinc-500">{activeFolderCards.length} cards in this folder</p>
                    </div>
                    <div className="flex gap-3">
                      <label className="cursor-pointer py-2 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all">
                        Import CSV
                        <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
                      </label>
                      <button 
                        onClick={startTest}
                        disabled={activeFolderCards.length === 0}
                        className="py-2 px-6 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50"
                      >
                        Start Test
                      </button>
                    </div>
                  </div>

                  <div className="h-[500px] max-w-xl mx-auto">
                    {activeFolderCards.length > 0 ? (
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={activeFolderCards[flashcardIndex].id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                          className="h-full"
                        >
                          <Flashcard 
                            card={activeFolderCards[flashcardIndex]} 
                            total={activeFolderCards.length}
                            current={flashcardIndex}
                            pinyinMode={pinyinMode}
                            setPinyinMode={setPinyinMode}
                            onNext={() => setFlashcardIndex((flashcardIndex + 1) % activeFolderCards.length)}
                            onPrev={() => setFlashcardIndex((flashcardIndex - 1 + activeFolderCards.length) % activeFolderCards.length)}
                            onDelete={async (id) => {
                              try {
                                await deleteDoc(doc(db, 'flashcards', id));
                                toast.success("Flashcard deleted");
                                if (flashcardIndex >= activeFolderCards.length - 1 && flashcardIndex > 0) {
                                  setFlashcardIndex(flashcardIndex - 1);
                                }
                              } catch (error) {
                                handleFirestoreError(error, OperationType.DELETE, 'flashcards');
                              }
                            }}
                          />
                        </motion.div>
                      </AnimatePresence>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl">
                        <BookOpen size={48} className="text-zinc-200 dark:text-zinc-800 mb-4" />
                        <p className="text-zinc-400">No cards in this folder yet.</p>
                      </div>
                    )}
                  </div>

                  {activeFolderCards.length > 0 && (
                    <div className="max-w-3xl mx-auto mt-12">
                      <h3 className="text-lg font-bold text-zinc-900 dark:text-white mb-4">All Cards in Folder</h3>
                      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                        <div className="max-h-[400px] overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/50">
                          {activeFolderCards.map((card, idx) => {
                            const isFrontChinese = !card.front.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/);
                            const chineseText = isFrontChinese ? card.front : card.back;
                            const englishText = isFrontChinese ? card.back : card.front;
                            
                            return (
                              <div 
                                key={card.id} 
                                className="p-4 transition-colors cursor-pointer border-b border-zinc-100 dark:border-zinc-800/50 last:border-0"
                                onClick={() => setFlashcardIndex(idx)}
                              >
                                <div className="flex-1">
                                  <div className="flex flex-col mb-2">
                                    {renderTokenizedText(chineseText, card.tokens, card.pinyin, true, true, 'sm')}
                                  </div>
                                  <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400">{englishText}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : viewMode === 'results' ? (
                <motion.div key="results" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-xl mx-auto text-center space-y-8 py-12">
                  <div className="space-y-4">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full mb-4">
                      <Trophy size={40} />
                    </div>
                    <h2 className="text-4xl font-serif font-bold dark:text-white">Test Complete!</h2>
                    <p className="text-zinc-500">Here's how you performed in {folders.find(f => f.id === activeFolderId)?.name}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                      <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-2">First Attempt Correct</p>
                      <p className="text-4xl font-serif font-bold text-green-500">{firstAttemptCorrect} / {testTotal}</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-3xl p-6 shadow-sm">
                      <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 mb-2">Total Attempts</p>
                      <p className="text-4xl font-serif font-bold text-indigo-500">{correctCount + incorrectCount}</p>
                      <p className="text-[10px] text-zinc-500 mt-1">{incorrectCount} mistakes made</p>
                    </div>
                  </div>

                  <div className="bg-indigo-600/5 dark:bg-indigo-600/10 border border-indigo-600/20 rounded-3xl p-8">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400">First-Try Accuracy</span>
                      <span className="text-2xl font-serif font-bold text-indigo-600 dark:text-indigo-400">
                        {Math.round((firstAttemptCorrect / testTotal) * 100) || 0}%
                      </span>
                    </div>
                    <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(firstAttemptCorrect / testTotal) * 100 || 0}%` }}
                        className="h-full bg-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4">
                    <button 
                      onClick={startTest}
                      className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-500 transition-all shadow-lg shadow-indigo-500/30"
                    >
                      Try Again
                    </button>
                    <button 
                      onClick={() => {
                        setFlashcardIndex(0);
                        setViewMode('flashcards');
                      }}
                      className="flex-1 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-2xl font-bold hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                    >
                      Back to Folder
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="test" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-serif font-bold dark:text-white">Testing: {folders.find(f => f.id === activeFolderId)?.name}</h2>
                    <div className="px-4 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full text-xs font-bold">
                      {testPile.length - flashcardIndex} cards remaining
                    </div>
                  </div>
                  <div className="h-[500px] max-w-xl mx-auto">
                    <Flashcard 
                      card={testPile[flashcardIndex]} 
                      total={testPile.length}
                      current={flashcardIndex}
                      pinyinMode={pinyinMode}
                      setPinyinMode={setPinyinMode}
                      onNext={() => setFlashcardIndex((flashcardIndex + 1) % testPile.length)}
                      onPrev={() => setFlashcardIndex((flashcardIndex - 1 + testPile.length) % testPile.length)}
                    />
                  </div>
                  <div className="max-w-xl mx-auto flex gap-4">
                    <button 
                      onClick={() => handleTestMark(false)}
                      className="flex-1 py-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-2xl font-bold hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/10"
                    >
                      Forgot
                    </button>
                    <button 
                      onClick={() => handleTestMark(true)}
                      className="flex-1 py-4 bg-green-500/10 text-green-500 border border-green-500/20 rounded-2xl font-bold hover:bg-green-500 hover:text-white transition-all shadow-lg shadow-green-500/10"
                    >
                      Remembered
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .dark .prose pre { background-color: #18181b; }
        .dark .prose code { color: #818cf8; }
      `}</style>
    </div>
  </>
  );
}

