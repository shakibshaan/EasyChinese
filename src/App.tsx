import React, { useState, useEffect, useRef } from 'react';
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
  Brain,
  Zap,
  Layers,
  Library,
  X,
  AlertTriangle,
  Menu,
  FileText,
  Trophy,
  Folder as FolderIcon,
  BookmarkPlus,
  CheckCircle2,
  Loader2,
  Home,
  Volume2,
  Settings,
  Info,
  Sun,
  Moon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, updateProfile, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, getDocFromServer, setDoc } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { analyzeSentence, SentenceAnalysis, WordBreakdown, SentenceToken, ContextExample } from './services/geminiService';
import { cn, playAudio } from './lib/utils';
import ReactMarkdown from 'react-markdown';
import { Toaster, toast } from 'sonner';

// --- Types ---
interface SavedSentence extends SentenceAnalysis {
  id: string;
  userId: string;
  createdAt: any;
  isLearned?: boolean;
  folderId: string;
}

interface Folder {
  id: string;
  name: string;
  userId: string;
  createdAt: any;
  isDefault?: boolean;
  parentId?: string | null;
  isSystem?: boolean;
}

interface SystemWord {
  word: string;
  pinyin: string;
  pos: string;
  meaning: string;
  lesson: string;
}

interface SystemContent {
  id: string;
  folderId: string;
  words: SystemWord[];
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
    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
  </button>
);

const CustomCaptcha = ({ onVerify }: { onVerify: (verified: boolean) => void }) => {
  const [num1, setNum1] = useState(0);
  const [num2, setNum2] = useState(0);
  const [answer, setAnswer] = useState('');
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    generateCaptcha();
  }, []);

  const generateCaptcha = () => {
    setNum1(Math.floor(Math.random() * 10) + 1);
    setNum2(Math.floor(Math.random() * 10) + 1);
    setAnswer('');
    setVerified(false);
    onVerify(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAnswer(val);
    if (parseInt(val) === num1 + num2) {
      setVerified(true);
      onVerify(true);
    } else {
      setVerified(false);
      onVerify(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-zinc-50 dark:bg-zinc-800/50 p-3 rounded-xl border border-zinc-200 dark:border-zinc-700">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
        What is {num1} + {num2}?
      </span>
      <input
        type="number"
        value={answer}
        onChange={handleChange}
        className="w-16 px-2 py-1 text-center bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none text-zinc-900 dark:text-white"
        placeholder="?"
      />
      {verified && <CheckCircle2 size={18} className="text-green-500 ml-auto" />}
    </div>
  );
};

const AuthModal = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captchaVerified && mode !== 'reset') {
      toast.error("Please verify the captcha");
      return;
    }
    setLoading(true);
    const trimmedEmail = email.trim();
    
    if (mode === 'signup') {
      if (password !== confirmPassword) {
        toast.error("Passwords do not match");
        setLoading(false);
        setCaptchaKey(k => k + 1);
        return;
      }
      try {
        await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        toast.success("Account created successfully!");
        onClose();
      } catch (e: any) {
        if (e.code === 'auth/email-already-in-use') {
          toast.error("This email is already registered. If you previously used Google to sign in, please use the Google button below.");
        } else if (e.code === 'auth/operation-not-allowed') {
          toast.error("Email/Password sign-in is not enabled in your Firebase Console. Please enable it in Authentication > Sign-in method.");
        } else {
          toast.error(e.message);
        }
        setCaptchaKey(k => k + 1);
      }
    } else if (mode === 'login') {
      try {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
        toast.success("Logged in successfully!");
        onClose();
      } catch (e: any) {
        if (e.code === 'auth/user-not-found') {
          toast.error("Account not found. Please check your email or sign up.");
        } else if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
          toast.error("Invalid email or password. If you previously used Google to sign in, please use the Google button below.");
        } else if (e.code === 'auth/operation-not-allowed') {
          toast.error("Email/Password sign-in is not enabled in your Firebase Console. Please enable it in Authentication > Sign-in method.");
        } else {
          toast.error(e.message);
        }
        setCaptchaKey(k => k + 1);
      }
    } else if (mode === 'reset') {
      try {
        await sendPasswordResetEmail(auth, trimmedEmail);
        toast.success("Password reset email sent!");
        setMode('login');
      } catch (e: any) {
        toast.error(e.message);
        setCaptchaKey(k => k + 1);
      }
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl" 
              onClick={onClose} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800"
            >
              <button onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                <X size={20} />
              </button>
              
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">
                {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
              </h2>

              {mode === 'login' && (
                <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl border border-indigo-100 dark:border-indigo-800 flex gap-3">
                  <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                    <strong>Note:</strong> If you previously used Google to sign in, please continue with Google. Using email/password with the same email address will create a separate account.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Email</label>
                  <input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                  />
                </div>

                {mode !== 'reset' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Password</label>
                    <input 
                      type="password" 
                      required 
                      value={password} 
                      onChange={e => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                    />
                  </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Confirm Password</label>
                    <input 
                      type="password" 
                      required 
                      value={confirmPassword} 
                      onChange={e => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                    />
                  </div>
                )}

                {mode !== 'reset' && (
                  <CustomCaptcha key={mode + captchaKey} onVerify={setCaptchaVerified} />
                )}

                <button 
                  type="submit" 
                  disabled={loading || (!captchaVerified && mode !== 'reset')}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? <Loader2 className="animate-spin" size={20} /> : (mode === 'login' ? 'Sign In' : mode === 'signup' ? 'Sign Up' : 'Send Reset Link')}
                </button>
              </form>

              <div className="mt-6 space-y-4">
                {mode === 'login' && (
                  <div className="text-center">
                    <button onClick={() => setMode('reset')} className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline">
                      Forgot your password?
                    </button>
                  </div>
                )}

                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-zinc-200 dark:border-zinc-700"></div></div>
                  <div className="relative flex justify-center text-sm"><span className="px-2 bg-white dark:bg-zinc-900 text-zinc-500">Or continue with</span></div>
                </div>

                <button 
                  onClick={handleGoogleLogin}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors font-medium"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Google
                </button>

                <div className="text-center text-sm text-zinc-600 dark:text-zinc-400 mt-4">
                  {mode === 'login' ? (
                    <>Don't have an account? <button onClick={() => setMode('signup')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Sign up</button></>
                  ) : (
                    <>Already have an account? <button onClick={() => setMode('login')} className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline">Sign in</button></>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const UserSettingsModal = ({ isOpen, onClose, user, localPic, onUpdatePic, onProfileUpdate }: { isOpen: boolean, onClose: () => void, user: User, localPic: string | null, onUpdatePic: (pic: string) => void, onProfileUpdate: () => void }) => {
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loadingName, setLoadingName] = useState(false);
  const [loadingPassword, setLoadingPassword] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const isPasswordProvider = user.providerData.some(p => p.providerId === 'password');

  if (!isOpen) return null;

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingName(true);
    try {
      await updateProfile(user, { displayName });
      onProfileUpdate();
      toast.success("Profile updated successfully!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingName(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user.email) return;
    setLoadingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, newPassword);
      toast.success("Password updated successfully!");
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoadingPassword(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 128;
        canvas.height = 128;
        const size = Math.min(img.width, img.height);
        const x = (img.width - size) / 2;
        const y = (img.height - size) / 2;
        ctx?.drawImage(img, x, y, size, size, 0, 0, 128, 128);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        localStorage.setItem(`profilePic_${user.uid}`, base64);
        onUpdatePic(base64);
        toast.success("Profile picture updated!");
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const displayPic = localPic || user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=random`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-xl" 
              onClick={onClose} 
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-zinc-900 rounded-3xl p-6 md:p-8 w-full max-w-md shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <button onClick={onClose} className="absolute top-4 right-4 p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                <X size={20} />
              </button>
              
              <h2 className="text-2xl font-bold text-zinc-900 dark:text-white mb-6">Settings</h2>

              <div className="space-y-8">
                {/* Profile Picture */}
                <div className="flex flex-col items-center gap-4">
                  <div className="relative group">
                    <img src={displayPic} alt="Profile" className="w-24 h-24 rounded-full border-4 border-zinc-100 dark:border-zinc-800 object-cover" referrerPolicy="no-referrer" />
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/50 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <span className="text-xs font-bold">Change</span>
                    </button>
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">{user.email}</p>
                    <p className="text-xs text-zinc-500">Signed in via {isPasswordProvider ? 'Email' : 'Google'}</p>
                  </div>
                </div>

                {/* Update Name */}
                <form onSubmit={handleUpdateName} className="space-y-3">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Profile</h3>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Display Name</label>
                    <input 
                      type="text" 
                      value={displayName} 
                      onChange={e => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      className="w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={loadingName || displayName === user.displayName}
                    className="w-full py-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-zinc-800 dark:hover:bg-white transition-colors disabled:opacity-50 flex items-center justify-center text-sm"
                  >
                    {loadingName ? <Loader2 className="animate-spin" size={16} /> : 'Save Name'}
                  </button>
                </form>

                {/* Update Password */}
                {isPasswordProvider && (
                  <form onSubmit={handleUpdatePassword} className="space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                    <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider">Security</h3>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">Current Password</label>
                      <input 
                        type="password" 
                        required
                        value={currentPassword} 
                        onChange={e => setCurrentPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-zinc-500 mb-1">New Password</label>
                      <input 
                        type="password" 
                        required
                        value={newPassword} 
                        onChange={e => setNewPassword(e.target.value)}
                        className="w-full px-4 py-2 rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white text-sm"
                      />
                    </div>
                    <button 
                      type="submit" 
                      disabled={loadingPassword || !currentPassword || !newPassword}
                      className="w-full py-2 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-500 transition-colors disabled:opacity-50 flex items-center justify-center text-sm"
                    >
                      {loadingPassword ? <Loader2 className="animate-spin" size={16} /> : 'Update Password'}
                    </button>
                  </form>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const LogoutConfirmModal = ({ isOpen, onClose, onConfirm }: { isOpen: boolean, onClose: () => void, onConfirm: () => void }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl p-8 border border-zinc-200 dark:border-zinc-800 text-center"
      >
        <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <LogOut size={32} className="text-red-500" />
        </div>
        <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Log Out?</h3>
        <p className="text-zinc-500 dark:text-zinc-400 mb-8">Are you sure you want to log out? Any unsaved changes in the current session might be lost.</p>
        <div className="flex gap-3">
          <button 
            onClick={onClose}
            className="flex-1 px-6 py-3 rounded-xl font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={onConfirm}
            className="flex-1 px-6 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/25"
          >
            Log Out
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const Auth = ({ user, onOpenAuthModal }: { user: User | null, onOpenAuthModal: () => void }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [localPic, setLocalPic] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  
  useEffect(() => {
    if (user) {
      const pic = localStorage.getItem(`profilePic_${user.uid}`);
      if (pic) setLocalPic(pic);
    } else {
      setLocalPic(null);
    }
  }, [user]);

  const logout = () => {
    signOut(auth);
    setIsLogoutConfirmOpen(false);
  };

  if (user) {
    const displayPic = localPic || user.photoURL || `https://ui-avatars.com/api/?name=${user.email}&background=random`;
    return (
      <>
        <div className="flex items-center gap-3 p-4 border-b border-zinc-200 dark:border-zinc-800">
          <img src={displayPic} alt={user.displayName || user.email || ''} className="w-8 h-8 rounded-full border border-zinc-300 dark:border-zinc-700 object-cover" referrerPolicy="no-referrer" />
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-medium truncate dark:text-zinc-200">{user.displayName || user.email?.split('@')[0]}</p>
            <p className="text-xs text-zinc-500 truncate dark:text-zinc-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setIsSettingsOpen(true)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500" title="Settings">
              <Settings size={18} />
            </button>
            <button onClick={() => setIsLogoutConfirmOpen(true)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors text-zinc-500" title="Log out">
              <LogOut size={18} />
            </button>
          </div>
        </div>
        <UserSettingsModal 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)} 
          user={user} 
          localPic={localPic}
          onUpdatePic={setLocalPic}
          onProfileUpdate={() => setRefresh(r => r + 1)}
        />
        <LogoutConfirmModal 
          isOpen={isLogoutConfirmOpen} 
          onClose={() => setIsLogoutConfirmOpen(false)} 
          onConfirm={logout} 
        />
      </>
    );
  }

  return (
    <>
      <div className="p-4 border-b border-zinc-200 dark:border-zinc-800">
        <button 
          onClick={onOpenAuthModal}
          className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-zinc-900 dark:bg-indigo-600 text-white rounded-lg hover:bg-zinc-800 dark:hover:bg-indigo-500 transition-colors font-medium shadow-lg shadow-indigo-500/20"
        >
          <LogIn size={18} />
          Sign In / Sign Up
        </button>
      </div>
    </>
  );
};

const renderTokenizedText = (text: string, tokens?: SentenceToken[], pinyin?: string, showPinyin: boolean = true, showChinese: boolean = true, size: 'sm' | 'lg' | 'mcq' = 'lg', isLibrary: boolean = false) => {
  const textLength = text.length;
  const isLong = textLength > 15;
  const isVeryLong = textLength > 30;

  // If tokens are missing, try to create them if pinyin is available
  let displayTokens = tokens;
  if (!displayTokens && pinyin && showChinese) {
    const chineseChars = Array.from(text).filter(c => !c.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/));
    const pinyinSyllables = pinyin.trim().split(/\s+/);
    
    // If lengths match, we can pair them
    if (chineseChars.length === pinyinSyllables.length) {
      displayTokens = [];
      let pinyinIdx = 0;
      for (const char of Array.from(text)) {
        if (!char.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/)) {
          displayTokens.push({ text: char, pinyin: pinyinSyllables[pinyinIdx++] });
        } else {
          displayTokens.push({ text: char });
        }
      }
    }
  }

  if (!displayTokens) {
    const actualShowChinese = showChinese || (!showChinese && !pinyin);
    return (
      <div className={cn("flex flex-col", size === 'lg' || size === 'mcq' ? "items-center" : "items-start")}>
        {actualShowChinese && (
          <span className={cn(
            "font-serif leading-tight text-zinc-900 dark:text-white text-center", 
            size === 'lg' 
              ? (showPinyin 
                  ? (isVeryLong ? "text-2xl md:text-4xl" : isLong ? "text-3xl md:text-5xl" : (isLibrary ? "text-6xl md:text-7xl" : "text-4xl md:text-6xl")) 
                  : (isVeryLong ? "text-3xl md:text-5xl" : isLong ? "text-4xl md:text-6xl" : (isLibrary ? "text-7xl md:text-8xl" : "text-5xl md:text-7xl"))) 
              : size === 'mcq'
                ? (showPinyin
                    ? (isVeryLong ? "text-xl md:text-2xl" : isLong ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl")
                    : (isVeryLong ? "text-2xl md:text-3xl" : isLong ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl"))
                : "text-2xl"
          )}>
            {text}
          </span>
        )}
        {showPinyin && pinyin && (
          <span className={cn(
            "font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tighter text-center", 
            size === 'lg' 
              ? (actualShowChinese 
                  ? (isVeryLong ? "text-xs md:text-sm mt-1" : isLong ? "text-sm md:text-base mt-1" : (isLibrary ? "text-xl md:text-2xl mt-1" : "text-base md:text-lg mt-1")) 
                  : (isVeryLong ? "text-2xl md:text-4xl" : isLong ? "text-3xl md:text-5xl" : (isLibrary ? "text-6xl md:text-7xl" : "text-4xl md:text-6xl"))) 
              : size === 'mcq'
                ? (actualShowChinese
                    ? (isVeryLong ? "text-[10px] md:text-xs mt-0.5" : isLong ? "text-xs md:text-sm mt-0.5" : "text-sm md:text-base mt-1")
                    : (isVeryLong ? "text-xl md:text-2xl" : isLong ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"))
                : "text-base mt-1"
          )}>
            {pinyin}
          </span>
        )}
      </div>
    );
  }
  
  return (
    <div className={cn(
      "flex flex-wrap gap-x-1 md:gap-x-2 gap-y-2", 
      size === 'lg' || size === 'mcq' ? "justify-center md:gap-y-4" : "justify-start",
      size === 'mcq' && "gap-x-0.5 md:gap-x-1"
    )}>
      {displayTokens.map((token, idx) => {
        const isPunctuation = !token.pinyin;
        const tokenShowChinese = showChinese || isPunctuation;
        return (
          <div key={idx} className="flex flex-col items-center justify-end">
            {tokenShowChinese && (
              <span className={cn(
                "font-serif text-zinc-900 dark:text-white leading-none", 
                size === 'lg' 
                  ? (showPinyin && !isPunctuation 
                      ? (isVeryLong ? "text-2xl md:text-4xl" : isLong ? "text-3xl md:text-5xl" : (isLibrary ? "text-6xl md:text-7xl" : "text-4xl md:text-6xl")) 
                      : (isVeryLong ? "text-3xl md:text-5xl" : isLong ? "text-4xl md:text-6xl" : (isLibrary ? "text-7xl md:text-8xl" : "text-5xl md:text-7xl"))) 
                  : size === 'mcq'
                    ? (showPinyin && !isPunctuation
                        ? (isVeryLong ? "text-xl md:text-2xl" : isLong ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl")
                        : (isVeryLong ? "text-2xl md:text-3xl" : isLong ? "text-3xl md:text-4xl" : "text-4xl md:text-5xl"))
                    : "text-2xl"
              )}>
                {token.text}
              </span>
            )}
            {showPinyin && token.pinyin && (
              <span className={cn(
                "font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tighter", 
                size === 'lg' 
                  ? (tokenShowChinese 
                      ? (isVeryLong ? "text-xs md:text-sm mt-1" : isLong ? "text-sm md:text-base mt-1" : (isLibrary ? "text-xl md:text-2xl mt-1" : "text-base md:text-lg mt-1")) 
                      : (isVeryLong ? "text-2xl md:text-4xl" : isLong ? "text-3xl md:text-5xl" : (isLibrary ? "text-6xl md:text-7xl" : "text-4xl md:text-6xl"))) 
                  : size === 'mcq'
                    ? (tokenShowChinese
                        ? (isVeryLong ? "text-[10px] md:text-xs mt-0.5" : isLong ? "text-xs md:text-sm mt-0.5" : "text-sm md:text-base mt-1")
                        : (isVeryLong ? "text-xl md:text-2xl" : isLong ? "text-2xl md:text-3xl" : "text-3xl md:text-4xl"))
                    : "text-base mt-1"
              )}>
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
  card: (FlashcardData | any) & { isSystem?: boolean }; 
  onNext: () => void; 
  onPrev: () => void;
  onDelete?: (id: string) => void;
  total: number;
  current: number;
  pinyinMode: boolean;
  setPinyinMode: (mode: boolean) => void;
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [lastCardId, setLastCardId] = useState(card?.id);

  if (card?.id !== lastCardId) {
    setIsFlipped(false);
    setLastCardId(card?.id);
  }

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
          onTap={() => setIsFlipped(!isFlipped)}
          onPanEnd={(e, info) => {
            if (info.offset.x < -50) onNext();
            else if (info.offset.x > 50) onPrev();
          }}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden bg-white dark:bg-zinc-900 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl shadow-indigo-500/5 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 md:p-8 scrollbar-hide">
              <div className="min-h-full flex flex-col items-center justify-center py-4">
                <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-4 md:mb-6">Question</span>
                <div className="w-full flex justify-center items-center gap-4">
                  {renderTokenizedText(chineseText, card.tokens, card.pinyin, pinyinMode, !pinyinMode, 'lg', card.isSystem)}
                  {isFrontChinese && (
                    <button 
                      onClick={(e) => { e.stopPropagation(); playAudio(chineseText); }} 
                      className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                      title="Play pronunciation"
                    >
                      <Volume2 size={24} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Back */}
          <div className="absolute inset-0 backface-hidden bg-zinc-50 dark:bg-zinc-950 border-2 border-zinc-200 dark:border-zinc-800 rounded-3xl shadow-xl rotate-y-180 overflow-hidden">
            <div className="h-full overflow-y-auto p-4 md:p-8 scrollbar-hide">
              <div className="min-h-full flex flex-col items-center justify-center py-4">
                <div className="mb-4 w-full flex flex-col items-center">
                  <div className="flex items-center gap-4">
                    {renderTokenizedText(chineseText, card.tokens, card.pinyin, true, true, 'lg', card.isSystem)}
                    <button 
                      onClick={(e) => { e.stopPropagation(); playAudio(chineseText); }} 
                      className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                      title="Play pronunciation"
                    >
                      <Volume2 size={24} />
                    </button>
                  </div>
                  <p className={cn(
                    "font-serif text-zinc-800 dark:text-zinc-200 mt-4 text-center",
                    card.isSystem ? "text-3xl md:text-3xl" : "text-2xl md:text-3xl"
                  )}>{englishText}</p>
                </div>

                {card.description && (
                  <div className="w-full text-left bg-white dark:bg-zinc-900 p-3 md:p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 mt-2">
                    <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">{card.description}</p>
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

const MCQTest = ({ 
  card, 
  allCards, 
  onAnswer, 
  pinyinMode, 
  setPinyinMode 
}: { 
  card: any; 
  allCards: any[]; 
  onAnswer: (correct: boolean) => void;
  pinyinMode: boolean;
  setPinyinMode: (mode: boolean) => void;
}) => {
  const [options, setOptions] = useState<{meaning: string, isCorrect: boolean}[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [lastCardId, setLastCardId] = useState(card?.id);

  if (card?.id !== lastCardId) {
    setSelectedOption(null);
    setIsAnswered(false);
    setLastCardId(card?.id);
  }

  // Helper to get the English/Translation side of a card
  const getEnglishText = (c: any) => {
    if (!c) return '';
    const isFrontChinese = !c.front.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/);
    return isFrontChinese ? c.back : c.front;
  };

  useEffect(() => {
    if (!card) return;
    const correctMeaning = getEnglishText(card);
    
    // Get all unique cards from allCards as potential distractors
    // We filter by English meaning to ensure distractors are distinct from the correct answer
    const otherCards = allCards.filter(c => getEnglishText(c) !== correctMeaning);
    
    // Use a Map to ensure unique English meanings among distractors
    const uniqueDistractorsMap = new Map();
    otherCards.forEach(c => {
      const eng = getEnglishText(c);
      if (eng && !uniqueDistractorsMap.has(eng)) {
        uniqueDistractorsMap.set(eng, c);
      }
    });
    
    const uniqueDistractors = Array.from(uniqueDistractorsMap.values());
    
    // Shuffle and pick 3 distractors
    const distractors = uniqueDistractors.sort(() => Math.random() - 0.5).slice(0, 3);
    
    const finalOptions = [
      { meaning: correctMeaning, isCorrect: true },
      ...distractors.map(d => ({ meaning: getEnglishText(d), isCorrect: false }))
    ].sort(() => Math.random() - 0.5);
    
    setOptions(finalOptions);
    setSelectedOption(null);
    setIsAnswered(false);
  }, [card, allCards]);

  const handleSelect = (idx: number) => {
    if (isAnswered) return;
    setSelectedOption(idx);
    setIsAnswered(true);
    
    setTimeout(() => {
      onAnswer(options[idx].isCorrect);
    }, 1000);
  };

  const isFrontChinese = !card.front.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/);
  const chineseText = isFrontChinese ? card.front : card.back;

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

      <div className="flex-1 flex flex-col items-center justify-center py-8">
        <div className="mb-12 text-center w-full max-w-2xl mx-auto">
          <span className="text-[10px] font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-600 mb-4 block">Question</span>
          <div className="flex items-center gap-4 justify-center">
            {renderTokenizedText(chineseText, card.tokens, card.pinyin, pinyinMode, !pinyinMode, 'mcq', card.isSystem)}
            <button 
              onClick={() => playAudio(chineseText)} 
              className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
              title="Play pronunciation"
            >
              <Volume2 size={24} />
            </button>
          </div>
        </div>

        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4">
          {options.map((option, idx) => (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              disabled={isAnswered}
              className={cn(
                "p-6 text-left rounded-2xl border-2 transition-all duration-200 flex items-center justify-between group",
                !isAnswered 
                  ? "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:shadow-lg" 
                  : selectedOption === idx
                    ? option.isCorrect 
                      ? "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400"
                      : "bg-red-50 dark:bg-red-900/20 border-red-500 text-red-700 dark:text-red-400"
                    : option.isCorrect
                      ? "bg-green-50 dark:bg-green-900/20 border-green-500 text-green-700 dark:text-green-400"
                      : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 opacity-50"
              )}
            >
              <span className="text-lg font-medium">{option.meaning}</span>
              {isAnswered && (
                option.isCorrect ? <CheckCircle2 size={24} className="text-green-500" /> : selectedOption === idx ? <X size={24} className="text-red-500" /> : null
              )}
            </button>
          ))}
        </div>
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
  isDataReady: boolean;
  folders: Folder[];
  activeFolderId: string | null;
  setActiveFolderId: (id: string | null) => void;
  systemFolders: Folder[];
  activeSystemFolderId: string | null;
  setActiveSystemFolderId: (id: string | null) => void;
  isLibraryView: boolean;
  setIsLibraryView: (view: boolean) => void;
  bootstrapSystemData: () => Promise<void>;
  isBootstrapping: boolean;
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
  onOpenAuthModal: () => void;
}

const SidebarContent = ({
  user,
  isDataReady,
  folders,
  activeFolderId,
  setActiveFolderId,
  systemFolders,
  activeSystemFolderId,
  setActiveSystemFolderId,
  isLibraryView,
  setIsLibraryView,
  bootstrapSystemData,
  isBootstrapping,
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
  setAnalysis,
  onOpenAuthModal
}: SidebarProps) => (
  <>
    <Auth user={user} onOpenAuthModal={onOpenAuthModal} />
    
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="p-4 space-y-8">
        {/* Library Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 font-bold">Library</h3>
            {user?.email === "shaanshakib5@gmail.com" && (
              <button 
                onClick={bootstrapSystemData} 
                disabled={isBootstrapping}
                className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:underline uppercase tracking-wider p-2 -mr-2 disabled:opacity-50"
              >
                {isBootstrapping ? "..." : "Bootstrap"}
              </button>
            )}
          </div>
          <div className="space-y-1">
            {systemFolders.filter(f => !f.parentId).map(f => {
              const hasChildren = systemFolders.some(sf => sf.parentId === f.id);
              return (
                <div key={f.id} className="group relative">
                  <div 
                    onClick={() => { 
                      setActiveSystemFolderId(f.id);
                      setActiveFolderId(null);
                      setIsLibraryView(true);
                      setFlashcardIndex(0);
                      setViewMode('flashcards');
                      if (window.innerWidth < 1024) setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all text-sm cursor-pointer",
                      activeSystemFolderId === f.id && isLibraryView ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg shadow-black/10 dark:shadow-white/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Trophy size={16} />
                      <span className="font-medium truncate max-w-[140px]">{f.name}</span>
                    </div>
                    {hasChildren && (
                      <ChevronRight 
                        size={14} 
                        className={cn("transition-transform", activeSystemFolderId === f.id ? "rotate-90" : "")} 
                      />
                    )}
                  </div>
                  {/* Subfolders */}
                  {activeSystemFolderId === f.id && hasChildren && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-zinc-200 dark:border-zinc-800 pl-2">
                      {systemFolders.filter(sf => sf.parentId === f.id).map(sf => (
                        <div 
                          key={sf.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveSystemFolderId(sf.id);
                            setActiveFolderId(null);
                            setIsLibraryView(true);
                            setFlashcardIndex(0);
                            setViewMode('flashcards');
                            if (window.innerWidth < 1024) setIsSidebarOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between p-2 rounded-lg transition-all text-xs cursor-pointer",
                            activeSystemFolderId === sf.id && isLibraryView ? "bg-zinc-900/10 dark:bg-zinc-100/10 text-zinc-900 dark:text-zinc-100 font-bold" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-500 dark:text-zinc-500"
                          )}
                        >
                          <span className="truncate">{sf.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Folders Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 font-bold">My Folders</h3>
            <button onClick={() => setIsAddingFolder(true)} className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 hover:underline uppercase tracking-wider p-2 -mr-2">+ New Folder</button>
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
                className="w-full p-2 text-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl focus:ring-1 focus:ring-zinc-500 outline-none"
              />
              <div className="flex gap-2">
                <button onClick={handleCreateFolder} className="flex-1 py-2 text-xs bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl font-bold hover:bg-zinc-800 dark:hover:bg-white transition-all">Add</button>
                <button onClick={() => setIsAddingFolder(false)} className="flex-1 py-2 text-xs bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 rounded-xl font-bold hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-all">Cancel</button>
              </div>
            </div>
          )}
          
          <div className="space-y-1">
            {!isDataReady && user ? (
              // Skeletal Loading for Folders
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="w-full flex items-center gap-3 p-3 rounded-xl animate-pulse">
                  <div className="w-4 h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md" />
                  <div className="h-4 bg-zinc-200 dark:bg-zinc-800 rounded-md w-24" />
                </div>
              ))
            ) : (
              [...folders].sort((a, b) => {
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
                      setActiveSystemFolderId(null);
                      setIsLibraryView(false);
                      setFlashcardIndex(0);
                      setViewMode('flashcards');
                      if (window.innerWidth < 1024) setIsSidebarOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-3 rounded-xl transition-all text-sm cursor-pointer",
                      activeFolderId === f.id && !isLibraryView ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg shadow-black/10 dark:shadow-white/10" : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen size={16} />
                      <span className="font-medium truncate max-w-[140px]">{f.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold opacity-60">
                        {flashcards.filter(c => c.folderId === f.id).length + savedSentences.filter(s => s.folderId === f.id).length}
                      </span>
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
              ))
            )}
          </div>
        </div>

        {/* Library Section */}
        <div>
          <div className="flex items-center justify-between mb-4 px-1">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500 font-bold">Recent Analysis</h3>
          </div>
          <div className="space-y-2">
            {!isDataReady && user ? (
              // Skeletal Loading for Recent Analysis
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="p-3 rounded-xl border border-transparent animate-pulse flex items-start gap-2">
                  <div className="w-3 h-3 bg-zinc-200 dark:bg-zinc-800 rounded-sm mt-0.5" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-800 rounded-md w-full" />
                    <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-md w-2/3" />
                  </div>
                </div>
              ))
            ) : (
              /* Merge recentAnalyses and savedSentences, avoiding duplicates */
              (() => {
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
              })()
            )}
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

const FolderSelectModal = ({ 
  isOpen, 
  onClose, 
  folders, 
  onSelect, 
  onAddFolder, 
  newFolderName, 
  setNewFolderName, 
  isAddingFolder, 
  setIsAddingFolder,
  savedInFolders = [],
  isSaving
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  folders: Folder[]; 
  onSelect: (folderId: string) => void;
  onAddFolder: () => void;
  newFolderName: string;
  setNewFolderName: (name: string) => void;
  isAddingFolder: boolean;
  setIsAddingFolder: (is: boolean) => void;
  savedInFolders?: string[];
  isSaving?: boolean;
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-xl"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800"
      >
        <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-white">Save to Folder</h3>
            {isSaving && (
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                className="text-indigo-500"
              >
                <Loader2 size={16} />
              </motion.div>
            )}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full text-zinc-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-2">
          {folders.map(folder => {
            const isSaved = savedInFolders.includes(folder.id);
            return (
              <button
                key={folder.id}
                disabled={isSaving}
                onClick={() => onSelect(folder.id)}
                className={cn(
                  "w-full flex items-center justify-between p-4 rounded-2xl transition-all border",
                  isSaved 
                    ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400" 
                    : "bg-zinc-50 dark:bg-zinc-800/50 border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 text-zinc-700 dark:text-zinc-300",
                  isSaving && "opacity-50 cursor-not-allowed"
                )}
              >
                <div className="flex items-center gap-3">
                  <BookmarkPlus size={18} className={isSaved ? "text-indigo-500" : "text-zinc-400"} />
                  <span className="font-medium">{folder.name}</span>
                </div>
                {isSaved ? (
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                    <CheckCircle2 size={16} />
                    Saved
                  </div>
                ) : (
                  <span className="text-xs text-zinc-400">Click to save</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6 bg-zinc-50 dark:bg-zinc-800/30 border-t border-zinc-100 dark:border-zinc-800">
          {isAddingFolder ? (
            <div className="flex gap-2">
              <input 
                autoFocus
                type="text" 
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="New folder name..."
                className="flex-1 px-4 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && onAddFolder()}
              />
              <button 
                onClick={onAddFolder}
                disabled={!newFolderName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 disabled:opacity-50"
              >
                Create
              </button>
              <button 
                onClick={() => setIsAddingFolder(false)}
                className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setIsAddingFolder(true)}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-2xl text-zinc-500 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-800 transition-all text-sm font-medium"
            >
              <BookmarkPlus size={18} />
              Create New Folder
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
};

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
  const [systemFolders, setSystemFolders] = useState<Folder[]>([]);
  const [systemContent, setSystemContent] = useState<SystemContent[]>([]);
  const [activeSystemFolderId, setActiveSystemFolderId] = useState<string | null>(null);
  const [isLibraryView, setIsLibraryView] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'analysis' | 'flashcards' | 'test' | 'results'>('analysis');
  const [testMode, setTestMode] = useState<'flashcard' | 'mcq'>('flashcard');
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
  const [isFolderSelectOpen, setIsFolderSelectOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [itemToSave, setItemToSave] = useState<{ 
    type: 'sentence' | 'word' | 'example', 
    data: any,
    savedInFolders: string[]
  } | null>(null);

  // Handle deep linking for saving words from extension
  useEffect(() => {
    if (!isAuthReady) return;
    
    const params = new URLSearchParams(window.location.search);
    const saveWord = params.get('saveWord');
    
    if (saveWord) {
      const pinyin = params.get('pinyin') || '';
      const translation = params.get('translation') || '';
      const pos = params.get('pos') || '';
      
      const wordObj = {
        word: saveWord,
        pinyin,
        translation,
        pos,
        definition: translation,
        context: ''
      };
      
      window.history.replaceState({}, document.title, window.location.pathname);
      
      setTimeout(() => {
        if (!user) {
          setIsAuthModalOpen(true);
          setPendingAction(() => () => handleSaveWord(wordObj));
        } else {
          handleSaveWord(wordObj);
        }
      }, 100);
    }
  }, [isAuthReady, user]);

  useEffect(() => {
    if (user && pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  }, [user, pendingAction]);
  const creatingDefaultFolder = React.useRef(false);

  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const loadingMessages = [
    "Generating analysis...",
    "Analyzing grammar...",
    "Exploring context...",
    "Word by word breakdown..."
  ];

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setLoadingMessageIndex((prev) => (prev + 1) % loadingMessages.length);
      }, 1500);
    } else {
      setLoadingMessageIndex(0);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (!u) {
        setIsDataReady(true);
      } else {
        setIsDataReady(false);
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
      setActiveFolderId(null);
      setDataLoaded({ sentences: false, folders: false, flashcards: false });
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

  // User Sync
  useEffect(() => {
    if (user && isAuthReady) {
      const syncUser = async () => {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDocFromServer(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              name: user.displayName,
              email: user.email,
              photoUrl: user.photoURL,
              role: 'user',
              createdAt: serverTimestamp()
            });
          }
        } catch (error) {
          console.error("User sync error:", error);
        }
      };
      syncUser();
    }
  }, [user, isAuthReady]);

  // System Folders Listener
  useEffect(() => {
    const qSystemFolders = query(collection(db, 'system_folders'), orderBy('name'));
    const unsubSystemFolders = onSnapshot(qSystemFolders, (s) => {
      setSystemFolders(s.docs.map(d => ({ ...d.data(), id: d.id, isSystem: true })) as Folder[]);
    });

    const qSystemContent = query(collection(db, 'system_content'));
    const unsubSystemContent = onSnapshot(qSystemContent, (s) => {
      setSystemContent(s.docs.map(d => ({ ...d.data(), id: d.id })) as SystemContent[]);
    });

    return () => { unsubSystemFolders(); unsubSystemContent(); };
  }, []);

  // Bootstrap System Data
  const bootstrapSystemData = async () => {
    if (!user || user.email !== "shaanshakib5@gmail.com" || isBootstrapping) return;
    
    setIsBootstrapping(true);
    const toastId = toast.loading("Bootstrapping HSK data...");
    
    try {
      // Check if "All HSK" exists
      const hskRoot = systemFolders.find(f => f.name === "All HSK" && !f.parentId);
      let rootId = hskRoot?.id;

      if (!rootId) {
        const docRef = await addDoc(collection(db, 'system_folders'), {
          name: "All HSK",
          parentId: null,
          createdAt: serverTimestamp()
        });
        rootId = docRef.id;
      }

      // Check if "hsk 4 上" exists
      const hsk4Shang = systemFolders.find(f => f.name === "hsk 4 上" && f.parentId === rootId);
      let subIdShang = hsk4Shang?.id;

      if (!subIdShang) {
        const docRef = await addDoc(collection(db, 'system_folders'), {
          name: "hsk 4 上",
          parentId: rootId,
          createdAt: serverTimestamp()
        });
        subIdShang = docRef.id;
      }

      // Check if content exists for "hsk 4 上"
      const existingContentShang = systemContent.find(c => c.folderId === subIdShang);
      if (!existingContentShang) {
        const csvData = `1,法律,fǎlǜ,n,law
1,俩,liǎ,num.-m,two, both
1,印象,yìnxiàng,n,impression
1,深,shēn,adj,deep
1,熟悉,shúxī,v,to be familiar with
1,不仅,bùjǐn,conj,not only
1,性格,xìnggé,n,character, personality
1,开玩笑,kāi wánxiào,,to be kidding
1,从来,cónglái,adv,always, all along
1,最好,zuìhǎo,adv,had better
1,共同,gòngtóng,adj,common, shared
1,适合,shìhé,v,to suit, to fit
1,幸福,xìngfú,adj,happy
1,生活,shēnghuó,n./v,life; to live
1,刚,gāng,adv,just, not long
1,浪漫,làngmàn,adj,romantic
1,够,gòu,v,to be enough
1,缺点,quēdiǎn,n,shortcoming
1,接受,jiēshòu,v,to accept
1,羡慕,xiànmù,v,to envy, to admire
1,爱情,àiqíng,n,love (between a man and a woman)
1,星星,xīngxing,n,star
1,即使,jíshǐ,conj,even if
1,加班,jiā bān,v,to work overtime
1,亮,liàng,v,to shine, to be lit
1,感动,gǎndòng,v,to touch, to move
1,自然,zìrán,adv,naturally, certainly
1,原因,yuányīn,n,reason
1,互相,hùxiāng,adv,mutually
1,吸引,xīyǐn,v,to attract
1,幽默,yōumò,adj,humourous
1,脾气,píqì,n,temper, disposition
2,正好,zhènghǎo,adv,just right, just in time
2,差不多,chàbuduō,adj,almost, nearly
2,适应,shìyìng,v,to adapt, to get used to
2,独立,dúlì,adj,independent
2,帮忙,bāngmáng,v,to help
2,出差,chūchāi,v,to go on a business trip
2,尽管,jǐnguǎn,conj,even though, although
2,陪,péi,v,to accompany
2,却,què,adv,but, yet
2,而,ér,conj,while, and
2,交流,jiāoliú,v,to communicate, to exchange
2,烦恼,fánnǎo,n,vexation, worry
2,信任,xìnrèn,v,to trust
2,遇到,yùdào,v,to encounter, to run into
2,困难,kùnnan,n,difficulty
2,支持,zhīchí,v,to support
2,咸,xián,adj,salty
2,甜,tián,adj,sweet
2,酸,suān,adj,sour
2,苦,kǔ,adj,bitter
2,味道,wèidào,n,taste, flavor
2,友谊,yǒuyì,n,friendship
2,简单,jiǎndān,adj,simple
2,复杂,fùzá,adj,complicated
2,也许,yěxǔ,adv,maybe, perhaps
3,印象,yìnxiàng,n,impression
3,挺,tǐng,adv,very, quite
3,先,xiān,adv,first
3,本来,běnlái,adv,originally
3,另外,lìngwài,conj,besides, in addition
3,首先,shǒuxiān,adv,first of all
3,其次,qícì,conj,secondly
3,不管,bùguǎn,conj,no matter (what, how, etc.)
3,重视,zhòngshì,v,to attach importance to
3,能力,nénglì,n,ability, capability
3,同意,tóngyì,v,to agree
3,电脑,diànnǎo,n,computer
3,发邮件,fā yóujiàn,,to send an email
3,翻译,fānyì,v,to translate
3,职业,zhíyè,n,profession, occupation
3,经验,jīngyàn,n,experience
3,面试,miànshì,n/job interview
3,衬衫,chènshān,n,shirt
3,领带,lǐngdài,n,necktie
3,西服,xīfú,n,suit
3,穿,chuān,v,to wear
3,颜色,yánsè,n,color
3,浅,qiǎn,adj,light (color)
3,深,shēn,adj,dark (color)
3,正式,zhèngshì,adj,formal
3,随便,suíbiàn,adj,casual, random
3,要求,yāoqiú,v/n,to demand, requirement
4,着急,zháojí,adj,anxious, worried
4,赚,zhuàn,v,to earn (money)
4,以为,yǐwéi,v,to think, to believe mistakenly
4,原来,yuánlái,adv,originally, actually
4,并,bìng,adv,actually, indeed
4,按照,ànzhào,prep,according to
4,甚至,shènzhì,adv,even
4,决定,juédìng,v/n,to decide, decision
4,研究,yánjiū,v/n,to research, research
4,研究生,yánjiūshēng,n,graduate student
4,毕业,bìyè,v,to graduate
4,工作,gōngzuò,v/n,to work, job
4,坚持,jiānchí,v,to persist, to insist on
4,计划,jìhuà,n,plan
4,实现,shíxiàn,v,to realize, to achieve
4,理想,lǐxiǎng,n,ideal, dream
4,努力,nǔlì,adv/adj,hard-working, to work hard
4,失败,shībài,v/n,to fail, failure
4,成功,chénggōng,v/n,to succeed, success
4,信心,xìnxīn,n,confidence
4,自己,zìjǐ,pron,oneself
4,希望,xīwàng,v/n,to hope, hope
5,肯定,kěndìng,adv,definitely, certainly
5,再说,zàishuō,conj,besides, moreover
5,实际,shíjì,adj,actual, practical
5,对……来说,duì...láishuō,,as far as...is concerned
5,尤其,yóuqí,adv,especially
5,价格,jiàgé,n,price
5,便宜,piányi,adj,cheap, inexpensive
5,贵,guì,adj,expensive
5,质量,zhìliàng,n,quality
5,选择,xuǎnzé,v/n,to choose, choice
5,值得,zhídé,v,to be worth
5,购物,gòuwù,v,to shop
5,刷卡,shuākǎ,,to pay by card
5,现金,xiànjīn,n,cash
5,超市,chāoshì,n,supermarket
5,打折,dǎzhé,v,to give a discount
5,促销,cùxiāo,v,to promote sales
5,顾客,gùkè,n,customer
5,服务员,fúwùyuán,n,waiter/waitress, attendant
5,注意,zhùyì,v,to pay attention to
5,仔细,zǐxì,adj,careful
5,发票,fāpiào,n,invoice, receipt
6,价格,jiàgé,n,price
6,竟然,jìngrán,adv,unexpectedly, to one's surprise
6,倍,bèi,m,times (multiple)
6,值得,zhídé,v,to be worth
6,其中,qízhōng,n,among them
6,下,xià,prep,under, beneath
6,消费者,xiāofèizhě,n,consumer
6,绿色,lǜsè,adj,green, environmentally friendly
6,食品,shípǐn,n,food
6,健康,jiànkāng,adj,healthy
6,发展,fāzhǎn,v,to develop
6,减少,jiǎnshǎo,v,to reduce, to decrease
6,污染,wūrǎn,v/n,to pollute, pollution
6,环境,huánjìng,n,environment
6,保护,bǎohù,v,to protect
6,选择,xuǎnzé,v,to choose
6,影响,yǐngxiǎng,v/n,to affect, influence
6,重要,zhòngyào,adj,important
6,理解,lǐjiě,v,to understand, to comprehend
6,道理,dàolǐ,n,principle, truth
6,意思,yìsi,n,meaning
7,估计,gūjì,v,to estimate, to guess
7,来不及,láibují,v,to be too late, to not have enough time
7,离,lí,prep,from, away from
7,要是,yàoshi,conj,if
7,既……又/也/还……,jì...yòu/yě/hái...,,both...and...
7,健康,jiànkāng,adj,healthy
7,医生,yīshēng,n,doctor
7,锻炼,duànliàn,v,to exercise
7,身体,shēntǐ,n,body
7,休息,xiūxi,v,to rest
7,重要,zhòngyào,adj,important
7,办法,bànfǎ,n,way, method
7,心情,xīnqíng,n,mood
7,生气,shēngqì,v,to get angry
7,脾气,píqì,n,temper
7,影响,yǐngxiǎng,v/n,to affect, influence
7,按时,ànshí,adv,on time
7,习惯,xíguàn,n,habit
7,作息,zuòxī,n,work and rest
7,规律,guīlǜ,n,regular pattern
7,熬夜,áo yè,v,to stay up late
7,抽烟,chōu yān,v,to smoke
7,喝酒,hē jiǔ,v,to drink alcohol
7,放松,fàngsōng,v,to relax
8,美,měi,adj,beautiful
8,使,shǐ,v,to make, to cause
8,只要,zhǐyào,conj,if only, as long as
8,可不是,kěbùshì,adv,indeed, it is
8,因此,yīncǐ,conj,therefore, consequently
8,往往,wǎngwǎng,adv,often, frequently
8,欣赏,xīnshǎng,v,to appreciate, to enjoy
8,风景,fēngjǐng,n,scenery, landscape
8,心情,xīnqíng,n,mood
8,放松,fàngsōng,v,to relax
8,压力,yālì,n,pressure, stress
8,减少,jiǎnshǎo,v,to reduce
8,烦恼,fánnǎo,n,vexation
8,发现,fāxiàn,v,to discover
8,平时,píngshí,n,usually, ordinarily
8,熟悉,shúxī,adj,familiar
8,虽然,suīrán,conj,although
8,却,què,adv,but, yet
8,缺点,quēdiǎn,n,shortcoming
8,优点,yōudiǎn,n,strong point, merit
8,缺少,quēshǎo,v,to lack
8,眼光,yǎnguāng,n,insight, vision
9,阳光,yángguāng,n,sunlight
9,风雨,fēngyǔ,n,wind and rain
9,难道,nándào,adv,(used in rhetorical questions) surely it doesn't mean...
9,通过,tōngguò,prep,by means of, through
9,可是,kěshì,conj,but
9,结果,jiéguǒ,conj/n,as a result, outcome
9,上,shàng,v,to go to (work, school, etc.)
9,失败,shībài,v/n,to fail, failure
9,成功,chénggōng,v/n,to succeed, success
9,经历,jīnglì,v/n,to experience, experience
9,经验,jīngyàn,n,experience
9,获得,huòdé,v,to gain, to obtain
9,珍惜,zhēnxī,v,to cherish, to value
9,机会,jīhuì,n,opportunity
9,努力,nǔlì,adv/adj,hard-working
9,坚持,jiānchí,v,to persist
9,最后,zuìhòu,adj/adv,final, finally
9,终于,zhōngyú,adv,finally, at last
9,笑,xiào,v,to laugh, to smile
9,哭,kū,v,to cry
9,面对,miànduì,v,to face, to confront
9,困难,kùnnan,n,difficulty
10,标准,biāozhǔn,n,standard, criterion
10,不过,búguò,conj,but, however
10,确实,quèshí,adv,indeed, really
10,在……看来,zài...kànlái,,in one's opinion
10,由于,yóuyú,conj,because of, due to
10,比如,bǐrú,conj,for example, such as
10,成功,chénggōng,v/n,to succeed, success
10,幸福,xìngfú,adj,happy
10,有钱,yǒuqián,adj,rich
10,快乐,kuàilè,adj,happy, joyful
10,健康,jiànkāng,adj,healthy
10,家庭,jiātíng,n,family
10,事业,shìyè,n,career
10,房子,fángzi,n,house
10,车子,chēzi,n,car
10,收入,shōurù,n,income
10,看法,kànfǎ,n,viewpoint
10,追求,zhuīqiú,v,to pursue
10,目标,mùbiāo,n,target, goal
10,不同,bùtóng,adj,different
10,价值观,jiàzhíguān,n,values
10,社会,shèhuì,n,society`;

        const lines = csvData.split('\n').filter(l => l.trim());
        const words: SystemWord[] = lines.map(line => {
          const parts = line.split(',');
          return { 
            lesson: parts[0] || "", 
            word: parts[1] || "", 
            pinyin: parts[2] || "", 
            pos: parts[3] || "", 
            meaning: parts.slice(4).join(',') || "" 
          };
        });

        await addDoc(collection(db, 'system_content'), {
          folderId: subIdShang,
          words
        });
      }

      // Check if "hsk 4 下" exists
      const hsk4Sub = systemFolders.find(f => f.name === "hsk 4 下" && f.parentId === rootId);
      let subId = hsk4Sub?.id;

      if (!subId) {
        const docRef = await addDoc(collection(db, 'system_folders'), {
          name: "hsk 4 下",
          parentId: rootId,
          createdAt: serverTimestamp()
        });
        subId = docRef.id;
      }

      // Check if content exists for "hsk 4 下"
      const existingContent = systemContent.find(c => c.folderId === subId);
      if (!existingContent) {
        const csvData = `11,流利,liúlì,adj,fluent
11,厉害,lìhai,adj,awesome, serious
11,语法,yǔfǎ,n,grammar
11,准确,zhǔnquè,adj,accurate, precise
11,词语,cíyǔ,n,word, expression
11,连,lián,prep,even
11,阅读,yuèdú,v,to read
11,来得及,láidejí,v,there's still time (to do sth.)
11,复杂,fùzá,adj,complicated
11,只好,zhǐhǎo,adv,cannot but, to be forced to
11,填空,tián kòng,v,to fill in a blank
11,猜,cāi,v,to guess
11,否则,fǒuzé,conj,or, otherwise
11,客厅,kètīng,n,living room
11,无论,wúlùn,conj,regardless of, no matter (what, how, when, etc.)
11,杂志,zázhì,n,magazine
11,著名,zhùmíng,adj,famous, well-known
11,页,yè,m,page
11,增加,zēngjiā,v,to increase, to add
11,文章,wénzhāng,n,essay, article
11,之,zhī,part,connecting the modifier and the word modified
11,内容,nèiróng,n,content
11,然而,rán'ér,conj,but, however
11,看法,kànfǎ,n,viewpoint, opinion
11,相同,xiāngtóng,adj,same
11,顺序,shùnxù,n,order, sequence
11,表示,biǎoshì,v,to express, to indicate
11,养成,yǎngchéng,v,to develop, to form
11,同时,tóngshí,conj,at the same time, meanwhile
11,精彩,jīngcǎi,adj,wonderful, splendid
12,规定,guīdìng,n,rule, regulation
12,死,sǐ,adj,rigid, inflexible
12,可惜,kěxī,adj,pitiful, regretful
12,全部,quánbù,n,all, whole
12,也许,yěxǔ,adv,maybe, perhaps
12,商量,shāngliang,v,to discuss, to consult
12,并且,bìngqiě,conj,and
12,盐,yán,n,salt
12,勺(子),sháo (zi),n,spoon
12,保护,bǎohù,v,to protect
12,作用,zuòyòng,n,function
12,无法,wúfǎ,v,cannot, to be unable (to do sth.)
12,无,wú,v,not to have, to be without
12,节,jié,m,section, length
12,详细,xiángxì,adj,detailed
12,解释,jiěshì,v,to explain
12,对于,duìyú,prep,for, to, with regard to
12,叶子,yèzi,n,leaf
12,教育,jiàoyù,v,to educate
12,使用,shǐyòng,v,to use
12,语言,yǔyán,n,language
12,直接,zhíjiē,adj,direct, straight
12,引起,yǐnqǐ,v,to cause, to lead to
12,误会,wùhuì,n,misunderstanding
12,友好,yǒuhǎo,adj,friendly
12,事半功倍,shì bàn gōng bèi,,to achieve twice the result with half the effort
12,节约,jiéyuē,v,to economize, to save
12,力气,lìqi,n,physical strength, effort
12,相反,xiāngfǎn,conj,on the contrary
12,任务,rènwu,n,task, mission
12,意见,yìjiàn,n,opinion, suggestion
12,仔细,zǐxì,adj,careful, meticulous
12,达到,dádào,v,to reach, to attain
13,京剧,jīngjù,n,Beijing opera
13,演员,yǎnyuán,n,actor/actress
13,观众,guānzhòng,n,audience
13,厚,hòu,adj,deep, profound
13,演出,yǎnchū,v,to perform, to put on (a show)
13,大概,dàgài,adv,roughly, approximately
13,来自,láizì,v,to be from
13,遍,biàn,m,(denoting an action from beginning to end) time
13,偶尔,ǒu'ěr,adv,occasionally, once in a while
13,吃惊,chī jīng,v,to be surprised, to be shocked
13,基础,jīchǔ,n,basis, foundation
13,表演,biǎoyǎn,v,to act, to perform
13,正常,zhèngcháng,adj,normal, regular
13,申请,shēnqǐng,v,to apply for
13,有趣,yǒuqù,adj,interesting, fun
13,开心,kāixīn,adj,happy, glad
13,继续,jìxù,v,to go on, to continue
13,由,yóu,prep,by (sb.)
13,讨论,tǎolùn,v,to discuss, to talk over
13,大约,dàyuē,adv,approximately, about
13,餐厅,cāntīng,n,restaurant
13,纸袋,zhǐdài,n,paper bag
13,互联网,hùliánwǎng,n,Internet
13,进行,jìnxíng,v,to conduct, to carry out
13,错误,cuòwù,adj,wrong
13,随着,suízhe,prep,along with, as
13,十分,shífēn,adv,very, extremely
13,普遍,pǔbiàn,adj,universal, common
13,部分,bùfen,n,part
13,稍微,shāowēi,adv,a little, slightly
13,苦,kǔ,adj,bitter
13,省,shěng,n,province
14,出差,chū chāi,v,to go on a business trip
14,毛巾,máojīn,n,towel
14,牙膏,yágāo,n,toothpaste
14,重,zhòng,adj,heavy, weighty
14,行,xíng,v,to be OK, to be all right
14,省,shěng,v,to save, to economize
14,污染,wūrǎn,v,to pollute
14,卫生间,wèishēngjiān,n,restroom, bathroom
14,脏,zāng,adj,dirty
14,抱歉,bàoqiàn,v,to be sorry
14,空,kōng,adj,empty
14,盒子,hézi,n,box, case
14,扔,rēng,v,to throw away
14,以,yǐ,prep,via, by means of
14,速度,sùdù,n,speed
14,地球,dìqiú,n,earth, globe
14,既然,jìrán,conj,since, as, now that
14,停,tíng,v,to stop, to cease
14,得意,déyì,adj,complacent, gloating
14,目的,mùdì,n,aim, purpose
14,暖,nuǎn,adj,warm
14,塑料袋,sùliàodài,n,plastic bag
14,于是,yúshì,conj,hence, therefore
14,鼓励,gǔlì,v,to encourage
14,拒绝,jùjué,v,to refuse, to reject
14,减少,jiǎnshǎo,v,to reduce, to decrease
14,数量,shùliàng,n,quantity, amount
14,温度,wēndù,n,temperature
14,乘坐,chéngzuò,v,to take (a vehicle), to ride (in a vehicle)
14,丢,diū,v,to throw, to cast
14,垃圾桶,lājītǒng,n,dustbin, trash can
14,美丽,měilì,adj,beautiful
15,弹钢琴,tán gāngqín,,to play the piano
15,棒,bàng,adj,excellent, amazing
15,孙子,sūnzi,n,grandson
15,寒假,hánjià,n,winter vacation
15,父亲,fùqīn,n,father
15,闹钟,nàozhōng,n,alarm clock
15,响,xiǎng,v,to sound, to ring
15,醒,xǐng,v,to wake up, to be awake
15,赶,gǎn,v,to rush for, to hurry
15,厕所,cèsuǒ,n,lavatory, toilet
15,批评,pīpíng,v,to criticize
15,弄,nòng,v,to do, to make
15,管理,guǎnlǐ,v,to manage, to administer
15,打针,dǎ zhēn,v,to give or have an injection
15,护士,hùshi,n,nurse
15,表扬,biǎoyáng,v,to praise, to commend
15,千万,qiānwàn,adv,must, to be sure to
15,怀疑,huáiyí,v,to suspect, to doubt
15,故意,gùyì,adv,intentionally, on purpose
15,敲,qiāo,v,to knock, to beat, to strike
15,整理,zhěnglǐ,v,to tidy up, to arrange
15,合适,héshì,adj,fit, suitable
15,骗,piàn,v,to cheat, to deceive
15,儿童,értóng,n,children
15,假,jiǎ,adj,false, fake
15,左右,zuǒyòu,n,around, or so
15,懒,lǎn,adj,lazy
15,笨,bèn,adj,stupid, foolish
15,粗心,cūxīn,adj,careless, thoughtless
15,骄傲,jiāo'ào,adj,arrogant, conceited
15,害羞,hàixiū,v,to be shy, to be timid
16,博士,bóshì,n,doctor (academic degree)
16,签证,qiānzhèng,n,visa
16,报名,bào míng,v,to apply, to sign up
16,表格,biǎogé,n,form, table
16,传真,chuánzhēn,v,to send by fax
16,号码,hàomǎ,n,number
16,参观,cānguān,v,to visit, to look around
16,激动,jīdòng,adj,excited, emotional
16,小伙子,xiǎǒhuǒzi,n,young man
16,记者,jìzhě,n,journalist, reporter
16,代表,dàibiǎo,v,to represent, to stand for
16,恐怕,kǒngpà,adv,(indicating an estimation) I guess...
16,失望,shīwàng,v,disappointed
16,郊区,jiāoqū,n,suburb,outskirts
16,到底,dàodǐ,adv,(used in questions for emphasis)...on earth
16,呀,ya,part,a variant of the interjection "啊" used at the end of a question to soften the tone
16,导游,dǎoyóu,n,tour guide
16,礼貌,lǐmào,adj,polite
16,原谅,yuánliàng,v,to forgive
16,挂,guà,v,to hang, to put up
16,同情,tóngqíng,v,to show sympathy for
16,推,tuī,v,to put off, to postpone
16,预习,yùxí,v,to prepare lessons before class
16,重点,zhòngdiǎn,n,focal point, emphasis
16,马虎,mǎhu,adj,careless, slipshod
16,自信,zìxìn,adj,self-confident
16,冷静,lěngjìng,adj,calm, composed
16,输,shū,v,to lose, to suffer defeat
16,重视,zhòngshì,v,to attach importance to
16,敢,gǎn,v,to dare
16,尊重,zūnzhòng,v,to respect
17,凉快,liángkuai,adj,pleasantly cool
17,热闹,rènao,adj,busy, bustling
17,云,yún,n,cloud
17,广播,guǎngbō,n,broadcast, radio program
17,照,zhào,v,to take a picture, to photograph
17,倒,dào,adv,(used to indicate contrast) yet, actually
17,毛,máo,n,hair, fur
17,抱,bào,v,to hold in the arms, to hug
17,干,gàn,v,to do, to act
17,严格,yángé,adj,strict, rigorous
17,难受,nánshòu,adj,sad, unhappy
17,趟,tàng,m,(used for a round trip) time
17,放暑假,fàng shǔjià,,to be on summer vacation
17,老虎,lǎohǔ,n,tiger
17,入口,rùkǒu,n,entrance
17,排队,pái duì,v,to form a line, to line up
17,活泼,huópō,adj,lively, vivacious
17,社会,shèhuì,n,society
17,竞争,jìngzhēng,v,to compete
17,森林,sēnlín,n,forest
17,剩,shèng,v,to be left over, to remain
17,暖和,nuǎnhuo,adj,warm
17,海洋,hǎiyáng,n,sea, ocean
17,底,dǐ,n,bottom, base
17,美人鱼,Měirényú,n,mermaid
17,公里,gōnglǐ,m,kilometer
17,仍然,réngrán,adv,still, yet
17,排列,páiliè,v,to put in order, to arrange
17,梦,mèng,n,dream
18,降落,jiàngluò,v,to descend, to land
18,火,huǒ,adj,hot, popular
18,作者,zuòzhě,n,author
18,交通,jiāotōng,n,traffic, communication
18,技术,jìshù,n,technology
18,是否,shífǒu,adv,if, whether
18,秒,miǎo,m,second, 1/60 minute
18,方式,fāngshì,n,way, mode
18,受不了,shòubuliǎo,,cannot stand, cannot bear
18,日记,rìjì,n,diary, journal
18,安全,ānquán,adj,safe, secure
18,密码,mìmǎ,n,password
18,允许,yǔnxǔ,v,to allow, to permit
18,座,zuò,m,used for bridges, mountains, buildings, etc.
18,桥,qiáo,n,bridge
18,危险,wēixiǎn,adj,dangerous
18,接着,jiēzhe,adv,then, immediately after that
18,警察,jǐngchá,n,police
18,抓,zhuā,v,to catch, to arrest
18,咸,xián,adj,salty
18,矿泉水,kuàngquánshuǐ,n,mineral water
18,付款,fù kuǎn,,to pay a sum of money
18,举,jǔ,v,to give, to enumerate
18,迷路,mí lù,v,to lose one's way
18,地址,dìzhǐ,n,address
18,地点,dìdiǎn,n,place, site
18,世纪,shìjì,n,century
18,邮局,yóujú,n,post office
18,收,shōu,v,to receive
18,信封,xìnfēng,n,envelope
18,网站,wǎngzhàn,n,website
18,信息,xìnxī,n,news, information
19,学期,xuéqī,n,term, semester
19,出生,chūshēng,v,to be born
19,性别,xìngbié,n,sex, gender
19,道歉,dào qiàn,v,to apologize
19,打印,dǎyìn,v,to print out
19,复印,fùyìn,v,to photocopy, to xerox
19,饺子,jiǎozi,n,jiaozi, dumpling
19,刀,dāo,n,knife
19,破,pò,adj,broken, torn
19,脱,tuō,v,to take off
19,理发,lǐ fà,v,to get a haircut
19,包子,bāozi,n,steamed stuffed bun
19,零钱,língqián,n,small change
19,打招呼,dǎ zhāohu,v,to greet, to say hello
19,戴,dài,v,to wear (accessories)
19,眼镜,yǎnjìng,n,glasses, spectacles
19,舞蹈,wǔdǎo,n,dance
19,国籍,guójí,n,nationality, citizenship
19,抬,tái,v,to lift, to raise
19,胳膊,gēbo,n,arm
19,转,zhuǎn,v,to turn, to shift
19,租,zū,v,to rent, to lease
19,吵,chǎo,adj,noisy
19,厨房,chúfáng,n,kitchen
19,房东,fángdōng,n,landlord/landlady
19,占线,zhànxiàn,v,(of a telephone line) to be busy, to be engaged
19,功夫,gōngfu,n,kung fu
19,乒乓球,pīngpāngqiú,n,table tennis, ping-pong
19,羽毛球,yǔmáoqiú,n,badminton
19,场,chǎng,m,used for sports or recreational events, etc.
19,禁止,jìnzhǐ,v,to prohibit, to forbid
19,座位,zuòwèi,n,seat
20,加油站,jiāyóuzhàn,n,gas station
20,航班,hángbān,n,scheduled flight
20,推迟,tuīchí,v,to postpone, to delay
20,高速公路,gāosù gōnglù,,expressway
20,登机牌,dēngjīpái,n,boarding pass
20,首都,shǒudū,n,capital (of a country)
20,旅行,lǚxíng,v,to travel, to tour
20,怪,guài,adv,rather, quite
20,可怜,kělián,adj,pitiable, poor
20,对面,duìmiàn,n,opposite, across
20,烤鸭,kǎoyā,n,roast duck
20,祝贺,zhùhè,v,to congratulate
20,合格,hégé,adj,qualified, up to standard
20,干杯,gān bēi,v,to drink a toast
20,民族,mínzú,n,nationality, ethnic group
20,打扮,dǎban,v,to dress up, to deck out
20,笑话,xiàohua,n,joke
20,存,cún,v,to store, to keep
20,钥匙,yàoshi,n,key
20,究竟,jiūjìng,adv,(used in questions for emphasis) exactly
20,棵,kē,m,used for plants
20,汤,tāng,n,soup
20,对话,duìhuà,v,to have a dialogue
20,普通话,pǔtōnghuà,n,Mandarin Chinese
20,小吃,xiǎochī,n,small and cheap dishes
20,收拾,shōushi,v,to put in order, to pack
20,出发,chūfā,v,to depart, to set off
20,辣,là,adj,hot, spicy
20,香,xiāng,adj,fragrant, scented
20,酸,suān,adj,sour, tart`;

        const lines = csvData.split('\n').filter(l => l.trim());
        const words: SystemWord[] = lines.map(line => {
          const parts = line.split(',');
          return { 
            lesson: parts[0] || "", 
            word: parts[1] || "", 
            pinyin: parts[2] || "", 
            pos: parts[3] || "", 
            meaning: parts.slice(4).join(',') || "" 
          };
        });

        await addDoc(collection(db, 'system_content'), {
          folderId: subId,
          words
        });
      }

      toast.success("HSK data bootstrapped successfully!", { id: toastId });
    } catch (error) {
      console.error("Bootstrap error:", error);
      toast.error("Failed to bootstrap HSK data", { id: toastId });
    } finally {
      setIsBootstrapping(false);
    }
  };

  // Create default folder if not exists
  useEffect(() => {
    if (user && isAuthReady && dataLoaded.folders && folders.length === 0 && !creatingDefaultFolder.current) {
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
  const isCleaningUp = useRef(false);
  useEffect(() => {
    if (!user || folders.length <= 1 || isCleaningUp.current) return;

    const cleanupDuplicates = async () => {
      const savedSentenceFolders = folders.filter(f => f.name === 'Saved Sentences');
      if (savedSentenceFolders.length <= 1) return;
      
      isCleaningUp.current = true;

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
          const folderSentences = savedSentences.filter(s => s.folderId === folder.id);
          for (const sentence of folderSentences) {
            await deleteDoc(doc(db, 'sentences', sentence.id));
            setRecentAnalyses(prev => prev.filter(a => a.originalText !== sentence.originalText));
          }
          await deleteDoc(doc(db, 'folders', folder.id));
        } catch (error) {
          console.error("Cleanup failed for folder:", folder.id, error);
        }
      }
      isCleaningUp.current = false;
    };

    cleanupDuplicates();
  }, [user, folders, flashcards, savedSentences]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isSaving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isSaving]);

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

    // 1. Check local recent analyses cache first
    const normalizedInput = inputText.trim().toLowerCase();
    const cachedAnalysis = recentAnalyses.find(a => a.originalText.toLowerCase() === normalizedInput);
    
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
      setViewMode('analysis');
      
      // Move to top of recent
      setRecentAnalyses(prev => {
        const filtered = prev.filter(a => a.originalText !== cachedAnalysis.originalText);
        return [cachedAnalysis, ...filtered].slice(0, 10);
      });
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
    if (!user) {
      setIsAuthModalOpen(true);
      setPendingAction(() => handleSave);
      return;
    }
    if (!analysis) return;
    const savedIn = savedSentences.filter(s => s.originalText === analysis.originalText).map(s => s.folderId);
    setItemToSave({ type: 'sentence', data: analysis, savedInFolders: savedIn });
    setIsFolderSelectOpen(true);
  };

  const handleSaveWord = async (word: WordBreakdown) => {
    if (!user) {
      setIsAuthModalOpen(true);
      setPendingAction(() => () => handleSaveWord(word));
      return;
    }
    const savedIn = flashcards.filter(c => c.front === word.word).map(c => c.folderId);
    setItemToSave({ type: 'word', data: word, savedInFolders: savedIn });
    setIsFolderSelectOpen(true);
  };

  const handleSaveExample = async (example: ContextExample) => {
    if (!user) {
      setIsAuthModalOpen(true);
      setPendingAction(() => () => handleSaveExample(example));
      return;
    }
    const savedIn = flashcards.filter(c => c.front === example.text).map(c => c.folderId);
    setItemToSave({ type: 'example', data: example, savedInFolders: savedIn });
    setIsFolderSelectOpen(true);
  };

  const handleCreateFolder = async () => {
    if (!user || !newFolderName.trim()) return;
    
    if (newFolderName.trim().length > 30) {
      toast.error("Folder name must be 30 characters or less.");
      return;
    }
    
    setIsAddingFolder(true);
    try {
      await addDoc(collection(db, 'folders'), {
        name: newFolderName.trim(),
        userId: user.uid,
        createdAt: serverTimestamp(),
        isDefault: false
      });
      setNewFolderName('');
      setIsAddingFolder(false);
      toast.success('Folder created');
    } catch (error) {
      console.error('Error adding folder:', error);
      toast.error('Failed to create folder');
      setIsAddingFolder(false);
    }
  };

  const handleSelectFolder = async (folderId: string) => {
    if (!user || !itemToSave || isSaving) return;
    
    setIsSaving(true);
    const { type, data } = itemToSave;
    let isRemoving = false;
    let existingId: string | null = null;

    if (type === 'sentence') {
      const existing = savedSentences.find(s => s.originalText === data.originalText && s.folderId === folderId);
      isRemoving = !!existing;
      existingId = existing?.id || null;
    } else {
      const front = type === 'word' ? data.word : data.text;
      const existing = flashcards.find(c => c.front === front && c.folderId === folderId);
      isRemoving = !!existing;
      existingId = existing?.id || null;
    }

    // Optimistic update
    setItemToSave(prev => {
      if (!prev) return null;
      return {
        ...prev,
        savedInFolders: isRemoving 
          ? prev.savedInFolders.filter(id => id !== folderId)
          : [...prev.savedInFolders, folderId]
      };
    });

    try {
      if (type === 'sentence') {
        if (isRemoving && existingId) {
          await deleteDoc(doc(db, 'sentences', existingId));
          setRecentAnalyses(prev => prev.filter(a => a.originalText !== (data as any).originalText));
          toast.success("Removed from folder");
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _id, ...analysisData } = data as any;
          await addDoc(collection(db, 'sentences'), {
            ...analysisData,
            folderId,
            userId: user.uid,
            createdAt: serverTimestamp(),
            isLearned: false
          });
          toast.success("Saved to folder");
        }
      } else if (type === 'word' || type === 'example') {
        const front = type === 'word' ? data.word : data.text;
        if (isRemoving && existingId) {
          await deleteDoc(doc(db, 'flashcards', existingId));
          toast.success("Removed from folder");
        } else {
          await addDoc(collection(db, 'flashcards'), {
            folderId,
            front,
            back: data.translation,
            pinyin: data.pinyin || '',
            description: type === 'word' ? (data.definition || data.context || '') : '',
            userId: user.uid,
            createdAt: serverTimestamp()
          });
          toast.success("Saved to folder");
        }
      }
    } catch (error) {
      // Revert optimistic update on error
      setItemToSave(prev => {
        if (!prev) return null;
        return {
          ...prev,
          savedInFolders: isRemoving 
            ? [...prev.savedInFolders, folderId]
            : prev.savedInFolders.filter(id => id !== folderId)
        };
      });
      handleFirestoreError(error, OperationType.WRITE, 'save_to_folder');
      toast.error("Failed to update folder.");
    } finally {
      setIsSaving(false);
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

  const startTest = (mode: 'flashcard' | 'mcq' = 'flashcard') => {
    if (activeFolderCards.length === 0) return;
    
    if (mode === 'mcq' && activeFolderCards.length < 4) {
      console.log("MCQ test requirement not met:", activeFolderCards.length);
      toast.error("Add at least 4 cards to start an MCQ test!", {
        description: "MCQ mode requires 4 unique cards to generate options.",
        duration: 5000,
      });
      return;
    }

    setTestMode(mode);
    setTestPile([...activeFolderCards]);
    setFlashcardIndex(0);
    setCorrectCount(0);
    setIncorrectCount(0);
    setFirstAttemptCorrect(0);
    setTestTotal(activeFolderCards.length);
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

      // Delete all sentences in this folder
      const folderSentences = savedSentences.filter(s => s.folderId === folderId);
      for (const sentence of folderSentences) {
        await deleteDoc(doc(db, 'sentences', sentence.id));
        setRecentAnalyses(prev => prev.filter(a => a.originalText !== sentence.originalText));
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

  const activeFolderCards = isLibraryView 
    ? (systemContent.find(c => c.folderId === activeSystemFolderId)?.words.map((w, idx) => ({
        id: `sys-${activeSystemFolderId}-${idx}`,
        folderId: activeSystemFolderId!,
        front: w.word,
        back: w.meaning,
        pinyin: w.pinyin,
        description: '',
        userId: 'system',
        createdAt: { toMillis: () => 0 },
        isSystem: true,
        type: 'system' as const
      })) || [])
    : [
        ...flashcards.filter(c => c.folderId === activeFolderId).map(c => ({ ...c, type: 'flashcard' as const })),
        ...savedSentences.filter(s => s.folderId === activeFolderId).map(s => ({
          id: s.id,
          folderId: s.folderId,
          front: s.originalText,
          back: s.translatedText,
          pinyin: s.pinyin || '',
          description: s.grammar,
          userId: s.userId,
          createdAt: s.createdAt,
          tokens: s.tokens,
          type: 'sentence' as const
        }))
      ].sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() || 0;
        const bTime = b.createdAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

  const isCurrentAnalysisSaved = analysis && savedSentences.some(s => s.originalText === analysis.originalText);
  const currentSavedInFolders = analysis 
    ? savedSentences.filter(s => s.originalText === analysis.originalText).map(s => s.folderId)
    : [];

return (
  <>
    <Toaster position="top-center" richColors />
    <AnimatePresence>
      {!isAuthReady && <LoadingScreen key="loading" />}
    </AnimatePresence>
    <div className={cn("flex flex-col h-[100dvh] overflow-hidden transition-colors duration-300", theme === 'dark' ? "bg-zinc-950 text-zinc-100 dark" : "bg-zinc-50 text-zinc-900")}>
      
      {/* Header */}
      <header className="h-16 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md flex items-center justify-between px-3 md:px-6 shrink-0 z-30">
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-4 md:p-2 -ml-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <Menu size={24} className="text-zinc-600 dark:text-zinc-400" />
          </button>
          <button 
            onClick={() => {
              setViewMode('analysis');
              setAnalysis(null);
              setIsAnalyzing(false);
            }}
            className="flex items-center gap-2 md:gap-4 hover:opacity-80 transition-opacity"
          >
            <h1 className="text-sm md:text-lg font-serif font-bold tracking-tight text-rose-500 dark:text-rose-400">EasyChinese</h1>
          </button>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <ThemeToggle theme={theme} toggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          {viewMode !== 'analysis' || analysis ? (
            <button 
              onClick={() => {
                setViewMode('analysis');
                setAnalysis(null);
                setIsAnalyzing(false);
              }}
              className="px-3 py-1.5 md:px-4 md:py-2 rounded-xl border-2 border-rose-500/20 dark:border-rose-400/20 bg-rose-500/5 dark:bg-rose-400/5 text-rose-600 dark:text-rose-400 hover:bg-rose-500 hover:text-white dark:hover:bg-rose-400 dark:hover:text-zinc-950 transition-all flex items-center gap-2 text-xs md:text-sm font-bold"
            >
              <Home size={16} />
              Back
            </button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Desktop */}
        <motion.aside 
          initial={false}
          animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
          className="hidden lg:flex h-full bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-800 flex-col shadow-xl z-20 overflow-hidden"
        >
          <SidebarContent 
            user={user}
            isDataReady={isDataReady}
            folders={folders}
            activeFolderId={activeFolderId}
            setActiveFolderId={setActiveFolderId}
            systemFolders={systemFolders}
            activeSystemFolderId={activeSystemFolderId}
            setActiveSystemFolderId={setActiveSystemFolderId}
            isLibraryView={isLibraryView}
            setIsLibraryView={setIsLibraryView}
            bootstrapSystemData={bootstrapSystemData}
            isBootstrapping={isBootstrapping}
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
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        </motion.aside>

        {/* Sidebar - Mobile Drawer */}
        <AnimatePresence>
          {isSidebarOpen && (
            <>
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-xl z-40"
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
                  isDataReady={isDataReady}
                  folders={folders}
                  activeFolderId={activeFolderId}
                  setActiveFolderId={setActiveFolderId}
                  systemFolders={systemFolders}
                  activeSystemFolderId={activeSystemFolderId}
                  setActiveSystemFolderId={setActiveSystemFolderId}
                  isLibraryView={isLibraryView}
                  setIsLibraryView={setIsLibraryView}
                  bootstrapSystemData={bootstrapSystemData}
                  isBootstrapping={isBootstrapping}
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
                  onOpenAuthModal={() => setIsAuthModalOpen(true)}
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <main className="flex-1 flex flex-col relative overflow-hidden">
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
                  {/* Hero Section */}
                  {!analysis && !isAnalyzing && (
                    <div className="text-center space-y-4 mb-8 md:mb-12">
                      <motion.h2 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-3xl md:text-5xl font-serif font-bold text-zinc-900 dark:text-white"
                      >
                        Master Chinese, <span className="text-rose-500">One Sentence</span> at a Time.
                      </motion.h2>
                      <motion.p 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-zinc-500 dark:text-zinc-400 text-sm md:text-lg max-w-2xl mx-auto"
                      >
                        The intelligent companion for your Chinese learning journey. Analyze, save, and study with ease.
                      </motion.p>
                    </div>
                  )}

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

                    {/* Examples Section */}
                    {!analysis && !isAnalyzing && (
                      <div className="flex flex-wrap items-center justify-center gap-2 pt-4">
                        <span className="text-xs font-medium text-zinc-400 mr-2">Try:</span>
                        {['你好吗？', '我学习中文。', '今天天气很好。'].map((example) => (
                          <button
                            key={example}
                            onClick={() => setInputText(example)}
                            className="px-3 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs hover:bg-rose-500 hover:text-white transition-colors"
                          >
                            {example}
                          </button>
                        ))}
                      </div>
                    )}
                  </section>

                  {!analysis && !isAnalyzing && (
                    <motion.div 
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="space-y-12 pt-8"
                    >
                      <div className="text-center space-y-4">
                        <h2 className="text-3xl md:text-5xl font-serif font-bold text-zinc-900 dark:text-white tracking-tight">
                          Master Chinese with <span className="text-rose-500">Ease</span>
                        </h2>
                        <p className="text-zinc-500 dark:text-zinc-400 max-w-2xl mx-auto text-sm md:text-lg">
                          EasyChinese helps you break down complex sentences, understand grammar, and build your vocabulary through interactive flashcards.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {[
                          {
                            icon: <BrainCircuit className="text-amber-500" size={24} />,
                            title: "Smart Analysis",
                            desc: "Instant breakdown of sentences with pinyin, translations, and word-by-word analysis.",
                            color: "amber"
                          },
                          {
                            icon: <FileText className="text-indigo-500" size={24} />,
                            title: "Grammar Guide",
                            desc: "Get deep insights into sentence structures and contextual usage for every phrase.",
                            color: "indigo"
                          },
                          {
                            icon: <BookmarkPlus className="text-rose-500" size={24} />,
                            title: "Flashcards",
                            desc: "Save any word or sentence to your personal library for active recall and testing.",
                            color: "rose"
                          },
                          {
                            icon: <BookOpen className="text-emerald-500" size={24} />,
                            title: "HSK Library",
                            desc: "Access curated content from HSK 1 to HSK 6 to accelerate your learning journey.",
                            color: "emerald"
                          }
                        ].map((feature, i) => (
                          <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 + (i * 0.1) }}
                            className="bg-white dark:bg-zinc-900 p-8 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm hover:border-indigo-500 transition-all group relative overflow-hidden"
                          >
                            <div className={`absolute top-0 right-0 w-24 h-24 bg-${feature.color}-500/5 -mr-8 -mt-8 rounded-full blur-2xl group-hover:bg-${feature.color}-500/10 transition-colors`} />
                            <div className="w-14 h-14 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform relative z-10">
                              {feature.icon}
                            </div>
                            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-3 relative z-10">{feature.title}</h3>
                            <p className="text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed relative z-10">{feature.desc}</p>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {/* Results Section */}
                  {isAnalyzing && (
                    <div className="space-y-6 md:space-y-10">
                      <div className="flex flex-col items-center justify-center py-8 space-y-4">
                        <RotateCw className="w-8 h-8 md:w-10 md:h-10 text-indigo-500 animate-spin" />
                        <p className="text-sm md:text-base font-medium text-zinc-500 dark:text-zinc-400 animate-pulse">
                          {loadingMessages[loadingMessageIndex]}
                        </p>
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
                         </div>
                         <div className="space-y-6 md:space-y-8">
                           <div>
                             {/* If original text is Chinese (not English-like) and we have tokens */}
                             {analysis.tokens && !analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) ? (
                               <div className="flex items-center gap-4 mb-4">
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
                                 <button 
                                   onClick={() => playAudio(analysis.originalText)}
                                   className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                   title="Play pronunciation"
                                 >
                                   <Volume2 size={24} />
                                 </button>
                               </div>
                             ) : (
                               <div className="flex items-center gap-4 mb-2">
                                 <h2 className="text-2xl md:text-4xl font-serif text-zinc-900 dark:text-white leading-tight">{analysis.originalText}</h2>
                                 {!analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) && (
                                   <button 
                                     onClick={() => playAudio(analysis.originalText)}
                                     className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                     title="Play pronunciation"
                                   >
                                     <Volume2 size={24} />
                                   </button>
                                 )}
                               </div>
                             )}
                           </div>
                           
                           <div className="h-px bg-zinc-100 dark:bg-zinc-800 w-full" />
                           
                           <div>
                             {/* If translated text is Chinese (original IS English-like) and we have tokens */}
                             {analysis.tokens && analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) ? (
                               <div className="flex items-center gap-4">
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
                                 <button 
                                   onClick={() => playAudio(analysis.translatedText)}
                                   className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                   title="Play pronunciation"
                                 >
                                   <Volume2 size={24} />
                                 </button>
                               </div>
                             ) : (
                               <div className="flex items-center gap-4">
                                 <p className="text-lg md:text-2xl text-zinc-600 dark:text-zinc-400 font-serif italic">{analysis.translatedText}</p>
                                 {analysis.originalText.match(/^[a-zA-Z0-9\s.,!?;:'"]+$/) && (
                                   <button 
                                     onClick={() => playAudio(analysis.translatedText)}
                                     className="p-2 text-zinc-400 hover:text-indigo-600 rounded-full hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors"
                                     title="Play pronunciation"
                                   >
                                     <Volume2 size={24} />
                                   </button>
                                 )}
                               </div>
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
                                      <button 
                                        onClick={() => playAudio(item.word)}
                                        className="ml-1 text-zinc-400 hover:text-indigo-600 transition-colors"
                                        title="Play pronunciation"
                                      >
                                        <Volume2 size={18} />
                                      </button>
                                    </div>
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
                                    const isSaved = flashcards.some(c => c.front === ex.text);
                                    return (
                                      <div key={idx} className="space-y-3 relative group/ex">
                                        <div className="flex justify-between items-start">
                                          <div className="flex flex-wrap gap-x-3 gap-y-2">
                                            {ex.tokens ? (
                                              ex.tokens.map((token, tIdx) => (
                                                <div key={tIdx} className="flex flex-col items-center">
                                                  <span className="text-xl md:text-2xl font-serif text-zinc-900 dark:text-white leading-none">{token.text}</span>
                                                  {token.pinyin && (
                                                    <span className="text-[10px] md:text-xs font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tight mt-1">
                                                      {token.pinyin}
                                                    </span>
                                                  )}
                                                </div>
                                              ))
                                            ) : (
                                              <div className="flex flex-col items-start">
                                                <span className="text-xl md:text-2xl font-serif text-zinc-900 dark:text-white leading-none">{ex.text}</span>
                                                {ex.pinyin && (
                                                  <span className="text-xs md:text-sm font-medium text-indigo-600 dark:text-indigo-400 font-sans lowercase tracking-tight mt-1">
                                                    {ex.pinyin}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <button 
                                              onClick={() => playAudio(ex.text)}
                                              className="p-2 rounded-xl transition-all text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
                                              title="Listen to Example"
                                            >
                                              <Volume2 size={16} />
                                            </button>
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
                      {!isDataReady ? (
                        <div className="space-y-2">
                          <div className="h-8 w-48 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                          <div className="h-4 w-32 bg-zinc-200 dark:bg-zinc-800 rounded-lg animate-pulse" />
                        </div>
                      ) : (
                        <>
                          <h2 className="text-2xl font-serif font-bold dark:text-white">
                            {isLibraryView 
                              ? systemFolders.find(f => f.id === activeSystemFolderId)?.name 
                              : folders.find(f => f.id === activeFolderId)?.name}
                          </h2>
                          <p className="text-sm text-zinc-500">{activeFolderCards.length} cards in this folder</p>
                        </>
                      )}
                    </div>
                    <div className="flex gap-3">
                      {!isLibraryView && (
                        <label className="cursor-pointer py-2 px-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-sm font-bold hover:bg-zinc-200 transition-all">
                          Import CSV
                          <input type="file" accept=".csv" onChange={handleCsvImport} className="hidden" />
                        </label>
                      )}
                      <div className="flex gap-2">
                        <button 
                          onClick={() => startTest('flashcard')}
                          disabled={activeFolderCards.length === 0 || !isDataReady}
                          className="py-2 px-4 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-2"
                        >
                          <Zap size={16} />
                          Flashcards
                        </button>
                        <button 
                          onClick={() => startTest('mcq')}
                          disabled={activeFolderCards.length === 0 || !isDataReady}
                          className="py-2 px-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-xl text-sm font-bold shadow-lg hover:bg-zinc-800 dark:hover:bg-white disabled:opacity-50 flex items-center gap-2"
                        >
                          <Brain size={16} />
                          MCQ Test
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="h-[500px] max-w-xl mx-auto">
                    {!isDataReady ? (
                      <div className="w-full h-full bg-zinc-200 dark:bg-zinc-800 rounded-3xl animate-pulse" />
                    ) : activeFolderCards.length > 0 ? (
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
                            onDelete={isLibraryView ? undefined : async (id) => {
                              let cardToDelete: any = null;
                              try {
                                cardToDelete = activeFolderCards.find(c => c.id === id);
                                if (cardToDelete?.type === 'sentence') {
                                  await deleteDoc(doc(db, 'sentences', id));
                                  setRecentAnalyses(prev => prev.filter(a => a.originalText !== cardToDelete.front));
                                } else {
                                  await deleteDoc(doc(db, 'flashcards', id));
                                }
                                toast.success("Deleted successfully");
                                if (flashcardIndex >= activeFolderCards.length - 1 && flashcardIndex > 0) {
                                  setFlashcardIndex(flashcardIndex - 1);
                                }
                              } catch (error) {
                                handleFirestoreError(error, OperationType.DELETE, cardToDelete?.type === 'sentence' ? 'sentences' : 'flashcards');
                              }
                            }}
                          />
                        </motion.div>
                      </AnimatePresence>
                    ) : isLibraryView && systemFolders.some(sf => sf.parentId === activeSystemFolderId) ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full h-fit">
                        {systemFolders.filter(sf => sf.parentId === activeSystemFolderId).map(sf => (
                          <div 
                            key={sf.id}
                            onClick={() => {
                              setActiveSystemFolderId(sf.id);
                              setFlashcardIndex(0);
                            }}
                            className="p-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl hover:border-indigo-500 transition-all cursor-pointer group shadow-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                                  <FolderIcon size={20} />
                                </div>
                                <span className="font-bold text-zinc-900 dark:text-white">{sf.name}</span>
                              </div>
                              <ChevronRight size={18} className="text-zinc-300 group-hover:text-indigo-500" />
                            </div>
                          </div>
                        ))}
                      </div>
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
                                <div className="flex items-start gap-4">
                                  <span className="text-xs font-mono text-zinc-400 mt-1">{idx + 1})</span>
                                  <div className="flex-1">
                                    <div className="flex flex-col mb-2">
                                      {renderTokenizedText(chineseText, card.tokens, card.pinyin, true, true, 'sm')}
                                    </div>
                                    <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400">{englishText}</p>
                                  </div>
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
                      onClick={() => startTest(testMode)}
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
                  <div className={cn("max-w-xl mx-auto", testMode === 'mcq' ? "h-auto" : "h-[500px]")}>
                    <AnimatePresence mode="wait">
                      {testMode === 'flashcard' ? (
                        <motion.div
                          key={testPile[flashcardIndex].id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -20 }}
                          transition={{ duration: 0.2 }}
                          className="h-full"
                        >
                          <Flashcard 
                            card={testPile[flashcardIndex]} 
                            total={testPile.length}
                            current={flashcardIndex}
                            pinyinMode={pinyinMode}
                            setPinyinMode={setPinyinMode}
                            onNext={() => handleTestMark(true)}
                            onPrev={() => handleTestMark(false)}
                          />
                        </motion.div>
                      ) : (
                        <motion.div
                          key={testPile[flashcardIndex].id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.2 }}
                        >
                          <MCQTest 
                            card={testPile[flashcardIndex]} 
                            allCards={activeFolderCards}
                            onAnswer={handleTestMark}
                            pinyinMode={pinyinMode}
                            setPinyinMode={setPinyinMode}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  {testMode === 'flashcard' && (
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
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>

      <FolderSelectModal 
        isOpen={isFolderSelectOpen}
        onClose={() => {
          setIsFolderSelectOpen(false);
          setItemToSave(null);
        }}
        folders={folders}
        onSelect={handleSelectFolder}
        onAddFolder={handleCreateFolder}
        newFolderName={newFolderName}
        setNewFolderName={setNewFolderName}
        isAddingFolder={isAddingFolder}
        setIsAddingFolder={setIsAddingFolder}
        savedInFolders={itemToSave?.savedInFolders || []}
        isSaving={isSaving}
      />

      <style>{`
        .perspective-1000 { perspective: 1000px; }
        .preserve-3d { transform-style: preserve-3d; }
        .backface-hidden { backface-visibility: hidden; }
        .rotate-y-180 { transform: rotateY(180deg); }
        .dark .prose pre { background-color: #18181b; }
        .dark .prose code { color: #818cf8; }
      `}</style>
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  </>
  );
}

