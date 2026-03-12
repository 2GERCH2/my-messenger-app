import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { create } from "zustand";
import { createContext, useContext } from "react";
import {
  Search,
  ArrowLeft,
  Menu,
  Eye,
  EyeOff,
  Loader2,
  X,
  Send,
  Check,
  CheckCheck,
  Settings,
  LogOut,
  Info,
} from "lucide-react";

// =========================
// Types & Mock DB (Client-side simulation for demo)
// =========================
type UserModel = { id: string; username: string; email: string; passwordHash: string; isVerified: boolean; createdAt: number; lastSeen: number; isOnline: boolean };
type ChatModel = { id: string; userA: string; userB: string; createdAt: number; updatedAt: number };
type MessageModel = { id: string; chatId: string; senderId: string; content: string; createdAt: number; isRead: boolean };
type VerificationCodeModel = { email: string; code: string; type: "register" | "login"; expiresAt: number; isUsed: boolean };

// LocalStorage keys
const LS_KEYS = {
  USERS: "botellon_users",
  CHATS: "botellon_chats",
  MESSAGES: "botellon_messages",
  CODES: "botellon_codes",
  SESSION: "botellon_session",
} as const;

// Simple hash (demo only, not for production)
const simpleHash = (s: string) => String(s.split("").reduce((a, c) => a + c.charCodeAt(0), 0) * 999983);
const generateId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function seedDemoData() {
  const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
  if (users.length === 0) {
    const demo: UserModel[] = [
      { id: "u1", username: "@alice", email: "alice@ex.com", passwordHash: simpleHash("Alice123"), isVerified: true, createdAt: Date.now() - 86400000, lastSeen: Date.now() - 120000, isOnline: true },
      { id: "u2", username: "@bob", email: "bob@ex.com", passwordHash: simpleHash("Bob12345"), isVerified: true, createdAt: Date.now() - 172800000, lastSeen: Date.now() - 600000, isOnline: false },
      { id: "u3", username: "@carlos", email: "carlos@ex.com", passwordHash: simpleHash("Carlos_99"), isVerified: true, createdAt: Date.now() - 259200000, lastSeen: Date.now() - 3600000, isOnline: true },
    ];
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(demo));

    const chats: ChatModel[] = [
      { id: "c1", userA: "u1", userB: "u2", createdAt: Date.now() - 80000, updatedAt: Date.now() - 40000 },
      { id: "c2", userA: "u1", userB: "u3", createdAt: Date.now() - 200000, updatedAt: Date.now() - 90000 },
    ];
    localStorage.setItem(LS_KEYS.CHATS, JSON.stringify(chats));

    const messages: MessageModel[] = [
      { id: "m1", chatId: "c1", senderId: "u2", content: "Привет, как дела?", createdAt: Date.now() - 45000, isRead: true },
      { id: "m2", chatId: "c1", senderId: "u1", content: "Привет! Всё отлично, ты как?", createdAt: Date.now() - 40000, isRead: true },
      { id: "m3", chatId: "c2", senderId: "u3", content: "Завтра созвон в 18:00?", createdAt: Date.now() - 100000, isRead: false },
    ];
    localStorage.setItem(LS_KEYS.MESSAGES, JSON.stringify(messages));
  }
}
seedDemoData();

// =========================
// Store (Zustand) - Global State
// =========================
type AppState = {
  currentUser: UserModel | null;
  chats: (ChatModel & { otherUser: UserModel; lastMessage?: MessageModel; unreadCount: number })[];
  activeChatId: string | null;
  onlineUsers: Set<string>;
  searchResults: UserModel[];
  setCurrentUser: (u: UserModel | null) => void;
  loadChats: () => void;
  setActiveChatId: (id: string | null) => void;
  setSearchResults: (users: UserModel[]) => void;
  markAsRead: (chatId: string) => void;
  addMessage: (m: MessageModel) => void;
};

const useAppStore = create<AppState>((set, get) => ({
  currentUser: null,
  chats: [],
  activeChatId: null,
  onlineUsers: new Set(),
  searchResults: [],
  setCurrentUser: (u) => set({ currentUser: u }),
  loadChats: () => {
    const user = get().currentUser;
    if (!user) return set({ chats: [] });
    const chats: ChatModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CHATS) || "[]");
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    const messages: MessageModel[] = JSON.parse(localStorage.getItem(LS_KEYS.MESSAGES) || "[]");

    const enriched = chats
      .filter((c) => c.userA === user.id || c.userB === user.id)
      .map((chat) => {
        const otherUserId = chat.userA === user.id ? chat.userB : chat.userA;
        const otherUser = users.find((u) => u.id === otherUserId)!;
        const chatMessages = messages.filter((m) => m.chatId === chat.id).sort((a, b) => b.createdAt - a.createdAt);
        const lastMessage = chatMessages[0];
        const unreadCount = messages.filter((m) => m.chatId === chat.id && m.senderId !== user.id && !m.isRead).length;
        return { ...chat, otherUser, lastMessage, unreadCount };
      })
      .sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));

    set({ chats: enriched, onlineUsers: new Set(users.filter(u => u.isOnline).map(u => u.id)) });
  },
  setActiveChatId: (id) => set({ activeChatId: id }),
  setSearchResults: (users) => set({ searchResults: users }),
  markAsRead: (chatId) => {
    const messages: MessageModel[] = JSON.parse(localStorage.getItem(LS_KEYS.MESSAGES) || "[]");
    const updated = messages.map((m) => (m.chatId === chatId && m.senderId !== get().currentUser?.id ? { ...m, isRead: true } : m));
    localStorage.setItem(LS_KEYS.MESSAGES, JSON.stringify(updated));
    get().loadChats();
  },
  addMessage: (m) => {
    const messages: MessageModel[] = JSON.parse(localStorage.getItem(LS_KEYS.MESSAGES) || "[]");
    messages.push(m);
    localStorage.setItem(LS_KEYS.MESSAGES, JSON.stringify(messages));

    // Update chat timestamp
    const chats: ChatModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CHATS) || "[]");
    const chatIndex = chats.findIndex((c) => c.id === m.chatId);
    if (chatIndex !== -1) {
      chats[chatIndex] = { ...chats[chatIndex], updatedAt: Date.now() };
      localStorage.setItem(LS_KEYS.CHATS, JSON.stringify(chats));
    }
    get().loadChats();
  },
}));

// =========================
// Auth & API Service (Mock)
// =========================
const api = {
  async register({ username, email, password }: { username: string; email: string; password: string }) {
    await new Promise(r => setTimeout(r, 400)); // simulate network
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    if (users.some(u => u.username === username)) throw new Error("username_taken");
    if (email && users.some(u => u.email === email)) throw new Error("email_taken");

    const requiresVerification = Boolean(email);
    const newUser: UserModel = {
      id: generateId(),
      username,
      email: email || "",
      passwordHash: simpleHash(password),
      isVerified: !requiresVerification,
      createdAt: Date.now(),
      lastSeen: Date.now(),
      isOnline: true,
    };
    users.push(newUser);
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(users));

    let code = "";
    if (requiresVerification) {
      // Generate 6-digit code
      code = String(Math.floor(100000 + Math.random() * 900000));
      const codes: VerificationCodeModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CODES) || "[]");
      codes.push({ email, code, type: "register", expiresAt: Date.now() + 5 * 60 * 1000, isUsed: false });
      localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));
    } else {
      localStorage.setItem(LS_KEYS.SESSION, JSON.stringify({ userId: newUser.id }));
    }

    return { user: newUser, userId: newUser.id, verificationCode: code, requiresVerification };
  },

  async verifyEmail({ email, code }: { email: string; code: string }) {
    await new Promise(r => setTimeout(r, 300));
    const codes: VerificationCodeModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CODES) || "[]");
    const idx = codes.findIndex(c => c.email === email && c.code === code && c.type === "register" && !c.isUsed && c.expiresAt > Date.now());
    if (idx === -1) throw new Error("invalid_code");
    codes[idx].isUsed = true;
    localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));

    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    const user = users.find(u => u.email === email);
    if (!user) throw new Error("user_not_found");
    user.isVerified = true;
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(users));
    localStorage.setItem(LS_KEYS.SESSION, JSON.stringify({ userId: user.id }));
    return { user };
  },

  async login({ username, password }: { username: string; password: string }) {
    await new Promise(r => setTimeout(r, 400));
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    const user = users.find(u => u.username === username && u.passwordHash === simpleHash(password) && u.isVerified);
    if (!user) throw new Error("invalid_credentials");

    const requires2FA = Boolean(user.email);
    let code = "";
    if (requires2FA) {
      // Generate 2FA code
      code = String(Math.floor(100000 + Math.random() * 900000));
      const codes: VerificationCodeModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CODES) || "[]");
      codes.push({ email: user.email, code, type: "login", expiresAt: Date.now() + 5 * 60 * 1000, isUsed: false });
      localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));
    } else {
      user.isOnline = true;
      user.lastSeen = Date.now();
      localStorage.setItem(LS_KEYS.USERS, JSON.stringify(users));
      localStorage.setItem(LS_KEYS.SESSION, JSON.stringify({ userId: user.id }));
    }

    return { userId: user.id, verificationCode: code, requires2FA, user };
  },

  async verify2FA({ userId, code }: { userId: string; code: string }) {
    await new Promise(r => setTimeout(r, 300));
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    const user = users.find(u => u.id === userId);
    if (!user) throw new Error("user_not_found");

    const codes: VerificationCodeModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CODES) || "[]");
    const idx = codes.findIndex(c => c.email === user.email && c.code === code && c.type === "login" && !c.isUsed && c.expiresAt > Date.now());
    if (idx === -1) throw new Error("invalid_code");
    codes[idx].isUsed = true;
    localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));

    user.isOnline = true;
    user.lastSeen = Date.now();
    localStorage.setItem(LS_KEYS.USERS, JSON.stringify(users));
    localStorage.setItem(LS_KEYS.SESSION, JSON.stringify({ userId }));
    return { user };
  },

  async me() {
    await new Promise(r => setTimeout(r, 200));
    const session = JSON.parse(localStorage.getItem(LS_KEYS.SESSION) || "null");
    if (!session) return null;
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    return users.find(u => u.id === session.userId) || null;
  },

  async searchUsers(q: string, currentUserId: string) {
    await new Promise(r => setTimeout(r, 250));
    if (q.length < 2) return [];
    const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
    return users.filter(u => u.id !== currentUserId && u.username.toLowerCase().includes(q.toLowerCase()) && u.isVerified);
  },

  async getOrCreateChat(userId: string, otherUserId: string) {
    await new Promise(r => setTimeout(r, 200));
    const chats: ChatModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CHATS) || "[]");
    let chat = chats.find(c =>
      (c.userA === userId && c.userB === otherUserId) ||
      (c.userA === otherUserId && c.userB === userId)
    );
    if (!chat) {
      chat = { id: generateId(), userA: userId, userB: otherUserId, createdAt: Date.now(), updatedAt: Date.now() };
      chats.push(chat);
      localStorage.setItem(LS_KEYS.CHATS, JSON.stringify(chats));
    }
    return chat;
  },

  async getMessages(chatId: string, before?: number, limit = 30) {
    await new Promise(r => setTimeout(r, 200));
    const messages: MessageModel[] = JSON.parse(localStorage.getItem(LS_KEYS.MESSAGES) || "[]");
    let filtered = messages.filter(m => m.chatId === chatId);
    if (before) filtered = filtered.filter(m => m.createdAt < before);
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).reverse();
  },

  async sendMessage(chatId: string, senderId: string, content: string) {
    await new Promise(r => setTimeout(r, 150));
    const msg: MessageModel = { id: generateId(), chatId, senderId, content, createdAt: Date.now(), isRead: false };
    const messages: MessageModel[] = JSON.parse(localStorage.getItem(LS_KEYS.MESSAGES) || "[]");
    messages.push(msg);
    localStorage.setItem(LS_KEYS.MESSAGES, JSON.stringify(messages));
    return msg;
  },
};

// =========================
// Socket Simulation (EventEmitter)
// =========================
type SocketEvent = "message:new" | "message:read" | "user:online" | "user:offline";
const socketListeners = new Map<SocketEvent, Set<(data: any) => void>>();
const socket = {
  on(event: SocketEvent, cb: (data: any) => void) {
    if (!socketListeners.has(event)) socketListeners.set(event, new Set());
    socketListeners.get(event)!.add(cb);
    return () => socketListeners.get(event)!.delete(cb);
  },
  emit(event: SocketEvent, data: any) {
    socketListeners.get(event)?.forEach(cb => cb(data));
  },
};

// Simulate incoming messages for demo (runs once)
let simulatorStarted = false;
function startMessageSimulator() {
  if (simulatorStarted) return;
  simulatorStarted = true;
  setInterval(() => {
    const state = useAppStore.getState();
    if (!state.currentUser || state.chats.length === 0) return;
    const randomChat = state.chats[Math.floor(Math.random() * state.chats.length)];
    if (!randomChat) return;
    const demoReplies = ["Окей!", "Скоро отвечу", "Понял", ")))", "Да, точно", "Хорошо"];
    const content = demoReplies[Math.floor(Math.random() * demoReplies.length)];
    const msg: MessageModel = {
      id: generateId(),
      chatId: randomChat.id,
      senderId: randomChat.otherUser.id,
      content,
      createdAt: Date.now(),
      isRead: false,
    };
    useAppStore.getState().addMessage(msg);
    socket.emit("message:new", msg);
  }, 15000 + Math.random() * 10000);
}

// =========================
// Context & Hooks
// =========================
const ToastContext = createContext<(msg: string, type?: "success" | "error") => void>(() => {});
function useToast() { return useContext(ToastContext); }

function useDebounce<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// =========================
// UI Components
// =========================
function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-8" : size === "lg" ? "h-12" : "h-10";
  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className="relative">
        <div className={`${h} aspect-square rounded-[14px] bg-gradient-to-br from-[#6c63ff] to-[#e94560] shadow-[0_8px_30px_rgba(108,99,255,0.35)] grid place-items-center`}>
          <span className="font-serif text-white font-bold text-[0.78em] tracking-[0.02em]">b</span>
        </div>
        <div className="absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full bg-[#0f0f23] border-2 border-[#1a1a2e]"></div>
      </div>
      <div className="leading-none">
        <div className="font-[620] tracking-tight text-[1.15em]" style={{ fontFamily: "'SF Pro Display', 'Inter', system-ui" }}>
          botellón
        </div>
        <div className="text-[10px] tracking-widest text-[#a0a0b0] -mt-0.5">PRIVATE MESSENGER</div>
      </div>
    </div>
  );
}

function Avatar({ name, size = 40, online }: { name: string; size?: number; online?: boolean }) {
  const initials = name.replace("@", "").slice(0, 2).toUpperCase();
  const colors = ["#6c63ff", "#e94560", "#00d2d3", "#f9a826", "#a259ff"];
  const bg = colors[initials.charCodeAt(0) % colors.length];
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className="rounded-full grid place-items-center font-[630] text-white select-none" style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.42 }}>
        {initials}
      </div>
      {online && (
        <span className="absolute bottom-0 right-0 block h-[26%] w-[26%] rounded-full bg-[#00d2d3] ring-[3px] ring-[#0f0f23]" />
      )}
    </div>
  );
}

function ToastContainer({ toasts, remove }: { toasts: { id: string; msg: string; type: "success" | "error" }[]; remove: (id: string) => void }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2.5 pointer-events-none">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} initial={{ y: 20, opacity: 0, scale: 0.98 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 10, opacity: 0 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className={`pointer-events-auto rounded-2xl px-4 py-3 text-[13.5px] backdrop-blur-xl shadow-[0_10px_40px_rgba(0,0,0,0.45)] border ${t.type === "error" ? "bg-[#1a1a2e]/90 border-[#e94560]/30 text-[#ff9aa8]" : "bg-[#1a1a2e]/90 border-[#00d2d3]/30 text-[#a7f3f3]"}`}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-[520] tracking-[0.01em]">{t.msg}</span>
              <button onClick={() => remove(t.id)} className="rounded-full p-1 hover:bg-white/10"><X size={14} /></button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// =========================
// Pages
// =========================
function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const debouncedUsername = useDebounce(username, 350);

  // Username validation & availability check
  useEffect(() => {
    const u = debouncedUsername.replace(/^@/, "");
    if (u.length < 3) { setUsernameAvailable(null); return; }
    if (!/^[a-zA-Z0-9_]{3,30}$/.test(u)) { setUsernameAvailable(false); return; }
    setCheckingUsername(true);
    const t = setTimeout(() => {
      const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
      setUsernameAvailable(!users.some(x => x.username === "@" + u));
      setCheckingUsername(false);
    }, 300);
    return () => clearTimeout(t);
  }, [debouncedUsername]);

  const passwordStrength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score; // 0-4
  }, [password]);

  const canSubmit = usernameAvailable && password.length >= 8 && password === confirm && (email.length === 0 || email.includes("@"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    try {
      const res = await api.register({ username: "@" + username.replace(/^@/, ""), email, password });
      if (res.requiresVerification) {
        // Show verification modal
        document.getElementById("verification-modal")?.classList.remove("hidden");
        (document.getElementById("verification-email") as HTMLSpanElement).textContent = email;
        (document.getElementById("verification-code-hint") as HTMLSpanElement).textContent = `Код: ${res.verificationCode} (демо)`;
        localStorage.setItem("pending_registration_email", email);
      } else {
        useAppStore.getState().setCurrentUser(res.user);
        useAppStore.getState().loadChats();
        toast("Аккаунт создан без 2FA", "success");
      }
    } catch (err: any) {
      toast(err.message === "username_taken" ? "Это имя пользователя уже занято" : "Ошибка регистрации", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#0f0f23] text-white antialiased flex flex-col">
      <header className="mx-auto w-full max-w-[1180px] px-5 pt-7 pb-4 flex items-center justify-center">
        <Logo size="lg" />
      </header>

      <main className="flex-1 grid place-items-center px-5 pb-10">
        <div className="w-full max-w-[420px] rounded-[22px] border border-white/10 bg-[#1a1a2e]/70 backdrop-blur-2xl shadow-[0_12px_60px_rgba(0,0,0,0.55)] p-[22px]">
          <div className="mb-5 text-center">
            <h1 className="text-[26px] font-[650] tracking-tight">Создать аккаунт</h1>
            <p className="mt-1 text-[13px] text-[#a0a0b0]">Приватный мессенджер без пересылок</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Username */}
            <div className="relative">
              <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Имя пользователя</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-[600] text-[#8a8aa3] select-none">@</span>
                <input value={username} onChange={e => setUsername(e.target.value.replace(/[^a-zA-Z0-9_@]/g, "").slice(0, 31))}
                  placeholder="username" className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 pl-8 pr-10 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingUsername ? <Loader2 size={16} className="animate-spin text-[#a0a0b0]" /> : usernameAvailable === true ? <Check size={16} className="text-[#00d2d3]" /> : usernameAvailable === false ? <X size={16} className="text-[#e94560]" /> : null}
                </div>
              </div>
              {usernameAvailable === false && debouncedUsername.length >= 3 && (
                <p className="mt-1.5 text-[12px] text-[#ff8fa1]">Это имя уже занято</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Email (необязательно, для 2FA)</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"
                className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 px-3.5 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
              <p className="mt-1.5 text-[11px] text-[#8a8aa3]">Если не указывать email, 2FA не потребуется.</p>
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Пароль</label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Минимум 8 символов"
                  className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 px-3.5 pr-10 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
                <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-white/10">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {/* Strength bar */}
              <div className="mt-2.5 flex items-center gap-2">
                {[0,1,2,3].map(i => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < passwordStrength ? (passwordStrength <= 1 ? 'bg-[#e94560]' : passwordStrength === 2 ? 'bg-[#f9a826]' : 'bg-[#00d2d3]') : 'bg-white/10'}`} />
                ))}
                <span className="ml-1 text-[11px] font-[600] w-[54px] text-right text-[#bdbdd0]">
                  {passwordStrength <= 1 ? "Слабый" : passwordStrength === 2 ? "Средний" : "Сильный"}
                </span>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Подтверждение пароля</label>
              <input type={showPassword ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Повторите пароль"
                className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 px-3.5 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
              {confirm && password !== confirm && (
                <p className="mt-1.5 text-[12px] text-[#ff8fa1]">Пароли не совпадают</p>
              )}
            </div>

            <button type="submit" disabled={!canSubmit || loading}
              className="mt-1 w-full rounded-[14px] bg-gradient-to-r from-[#6c63ff] to-[#e94560] py-[14px] text-[15px] font-[650] tracking-[0.01em] shadow-[0_8px_30px_rgba(108,99,255,0.35)] disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2">
              {loading ? <><Loader2 size={18} className="animate-spin"/> Создание...</> : "Создать аккаунт"}
            </button>
          </form>

          <p className="mt-5 text-center text-[13px] text-[#a0a0b0]">
            Уже есть аккаунт?{" "}
            <button onClick={onSwitchToLogin} className="font-[600] text-[#8f8aff] hover:text-white underline decoration-[rgba(143,138,255,0.35)] underline-offset-[3px]">Войти</button>
          </p>
        </div>
      </main>

      {/* Verification Modal */}
      <div id="verification-modal" className="hidden fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] grid place-items-center p-5">
        <div className="w-full max-w-[380px] rounded-[22px] border border-white/15 bg-[#1a1a2e]/90 backdrop-blur-2xl p-6 shadow-[0_20px_80px_rgba(0,0,0,0.65)]">
          <h3 className="text-[20px] font-[650] mb-1.5">Подтвердите email</h3>
          <p className="text-[13px] text-[#bdbdd0] mb-4">Мы отправили 6-значный код на <span id="verification-email" className="font-[600] text-white"></span></p>
          <div className="text-[11px] text-[#8a8aa3] mb-4 font-mono" id="verification-code-hint"></div>

          <VerificationCodeInput
            onComplete={async (code) => {
              const email = localStorage.getItem("pending_registration_email");
              if (!email) return;
              try {
                const { user } = await api.verifyEmail({ email, code });
                useAppStore.getState().setCurrentUser(user);
                useAppStore.getState().loadChats();
                document.getElementById("verification-modal")?.classList.add("hidden");
                toast("Аккаунт создан! Добро пожаловать в botellón", "success");
              } catch {
                toast("Неверный или просроченный код", "error");
              }
            }}
          />

          <div className="mt-5 flex items-center justify-between text-[12.5px]">
            <ResendCodeButton email={localStorage.getItem("pending_registration_email") || ""} type="register" />
            <button onClick={() => document.getElementById("verification-modal")?.classList.add("hidden")} className="font-[600] text-[#a0a0b0] hover:text-white">Отменить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [pendingUserId, setPendingUserId] = useState<string>("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.login({ username: username.startsWith("@") ? username : "@" + username, password });
      if (res.requires2FA) {
        setPendingUserId(res.userId);
        setStep("code");
        // Show code hint (demo)
        document.getElementById("login-code-hint")!.textContent = `Код: ${res.verificationCode} (демо)`;
      } else {
        useAppStore.getState().setCurrentUser(res.user);
        useAppStore.getState().loadChats();
        toast("Вход выполнен без 2FA", "success");
      }
    } catch {
      toast("Неверное имя пользователя или пароль", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-dvh w-full bg-[#0f0f23] text-white antialiased flex flex-col">
      <header className="mx-auto w-full max-w-[1180px] px-5 pt-7 pb-4 flex items-center justify-center">
        <Logo size="lg" />
      </header>

      <main className="flex-1 grid place-items-center px-5 pb-10">
        <div className="w-full max-w-[400px] rounded-[22px] border border-white/10 bg-[#1a1a2e]/70 backdrop-blur-2xl shadow-[0_12px_60px_rgba(0,0,0,0.55)] p-[22px]">
          {step === "credentials" ? (
            <>
              <div className="mb-5 text-center">
                <h1 className="text-[26px] font-[650] tracking-tight">Вход в botellón</h1>
                <p className="mt-1 text-[13px] text-[#a0a0b0]">2FA потребуется только если указан email</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Имя пользователя</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-[600] text-[#8a8aa3] select-none">@</span>
                    <input value={username.replace(/^@/, "")} onChange={e => setUsername(e.target.value)} placeholder="username"
                      className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 pl-8 pr-3.5 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[12.5px] font-[550] text-[#c7c7d2]">Пароль</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Ваш пароль"
                      className="w-full rounded-[14px] border border-white/10 bg-[#16213e]/60 px-3.5 pr-10 py-[13px] text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20 transition" />
                    <button type="button" onClick={() => setShowPassword(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 hover:bg-white/10">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading || !username || !password}
                  className="mt-1 w-full rounded-[14px] bg-[#6c63ff] py-[14px] text-[15px] font-[650] tracking-[0.01em] shadow-[0_8px_30px_rgba(108,99,255,0.35)] disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? <><Loader2 size={18} className="animate-spin"/> Вход...</> : "Войти"}
                </button>
              </form>

              <p className="mt-5 text-center text-[13px] text-[#a0a0b0]">
                Нет аккаунта?{" "}
                <button onClick={onSwitchToRegister} className="font-[600] text-[#8f8aff] hover:text-white underline decoration-[rgba(143,138,255,0.35)] underline-offset-[3px]">Зарегистрироваться</button>
              </p>
            </>
          ) : (
            <>
              <div className="mb-5 text-center">
                <h2 className="text-[22px] font-[650]">Введите код из письма</h2>
                <p className="mt-1 text-[12.5px] text-[#bdbdd0]">Код отправлен на ваш email и действителен 5 минут</p>
                <div className="mt-2 text-[11px] text-[#8a8aa3] font-mono" id="login-code-hint"></div>
              </div>

              <VerificationCodeInput
                onComplete={async (code) => {
                  try {
                    const { user } = await api.verify2FA({ userId: pendingUserId, code });
                    useAppStore.getState().setCurrentUser(user);
                    useAppStore.getState().loadChats();
                    toast("Добро пожаловать обратно!", "success");
                  } catch {
                    toast("Неверный код", "error");
                  }
                }}
              />

              <div className="mt-5 flex items-center justify-center">
                <ResendCodeButton userId={pendingUserId} type="login" />
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function VerificationCodeInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const handleChange = (idx: number, val: string) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...code];
    next[idx] = val;
    setCode(next);
    if (val && idx < 5) inputsRef.current[idx + 1]?.focus();
    if (next.every(d => d !== "") ) onComplete(next.join(""));
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (text.length === 6) {
      const arr = text.split("");
      setCode(arr);
      onComplete(text);
      inputsRef.current[5]?.focus();
    }
  };

  return (
    <div className="flex items-center justify-center gap-2.5" onPaste={handlePaste}>
      {code.map((digit, i) => (
        <input key={i} ref={el => { inputsRef.current[i] = el; }} value={digit}
          onChange={e => handleChange(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
          maxLength={1} inputMode="numeric" pattern="[0-9]*"
          className="h-[52px] w-[46px] rounded-[14px] border border-white/15 bg-[#16213e]/70 text-center text-[22px] font-[700] tracking-[0.05em] outline-none focus:border-[#6c63ff] focus:ring-4 focus:ring-[#6c63ff]/25" />
      ))}
    </div>
  );
}

function ResendCodeButton({ email, userId, type }: { email?: string; userId?: string; type: "register" | "login" }) {
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const handleResend = async () => {
    if (cooldown > 0) return;
    setCooldown(60);
    // In real app, call API to resend. Here we just simulate.
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const codes: VerificationCodeModel[] = JSON.parse(localStorage.getItem(LS_KEYS.CODES) || "[]");
    if (type === "register" && email) {
      codes.push({ email, code, type: "register", expiresAt: Date.now() + 5 * 60 * 1000, isUsed: false });
      localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));
      document.getElementById("verification-code-hint")!.textContent = `Новый код: ${code} (демо)`;
    }
    if (type === "login" && userId) {
      const users: UserModel[] = JSON.parse(localStorage.getItem(LS_KEYS.USERS) || "[]");
      const user = users.find(u => u.id === userId);
      if (user) {
        codes.push({ email: user.email, code, type: "login", expiresAt: Date.now() + 5 * 60 * 1000, isUsed: false });
        localStorage.setItem(LS_KEYS.CODES, JSON.stringify(codes));
        document.getElementById("login-code-hint")!.textContent = `Новый код: ${code} (демо)`;
      }
    }
  };

  return (
    <button onClick={handleResend} disabled={cooldown > 0}
      className="text-[12.5px] font-[600] text-[#8f8aff] hover:text-white disabled:text-[#666] disabled:cursor-not-allowed">
      {cooldown > 0 ? `Отправить снова (${cooldown}s)` : "Отправить код повторно"}
    </button>
  );
}

function ChatsPage() {
  const { currentUser, chats, setActiveChatId, searchResults, setSearchResults } = useAppStore();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [showUserMenu, setShowUserMenu] = useState(false);
  const debouncedQuery = useDebounce(query, 300);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close search dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchResults([]);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => { document.removeEventListener("mousedown", handler); };
  }, [setSearchResults]);

  // Search users
  useEffect(() => {
    if (!currentUser || debouncedQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    api.searchUsers(debouncedQuery, currentUser.id).then(setSearchResults);
  }, [debouncedQuery, currentUser]);

  const handleStartChat = async (otherUser: UserModel) => {
    if (!currentUser) return;
    const chat = await api.getOrCreateChat(currentUser.id, otherUser.id);
    setActiveChatId(chat.id);
    setSearchResults([]);
    setQuery("");
  };

  if (!currentUser) return null;

  return (
    <div className="flex h-dvh w-full flex-col bg-[#0f0f23] text-white antialiased">
      {/* Top Bar */}
      <header className="relative z-30 flex h-[64px] items-center justify-between border-b border-white/10 bg-[#1a1a2e]/80 px-4 backdrop-blur-xl">
        <button onClick={() => setShowUserMenu(true)} className="rounded-xl p-2.5 hover:bg-white/10">
          <Menu size={22} />
        </button>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Logo size="sm" />
        </div>
        <Avatar name={currentUser.username} size={36} online />
      </header>

      {/* Search */}
      <div className="relative border-b border-white/10 bg-[#1a1a2e]/60 px-4 py-3 backdrop-blur-xl" ref={searchRef}>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8a8aa3]" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск @username..."
            className="h-[46px] w-full rounded-[16px] border border-white/10 bg-[#16213e]/70 pl-10 pr-4 text-[15px] font-[500] outline-none placeholder:text-[#7a7a92] focus:border-[#6c63ff]/60 focus:ring-4 focus:ring-[#6c63ff]/20" />
        </div>

        {/* Search Dropdown */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className="absolute left-4 right-4 top-[68px] z-40 max-h-[66vh] overflow-hidden rounded-[18px] border border-white/15 bg-[#1a1a2e]/95 backdrop-blur-2xl shadow-[0_20px_80px_rgba(0,0,0,0.65)]">
              <div className="max-h-[66vh] overflow-y-auto p-2">
                {searchResults.map(user => (
                  <div key={user.id} className="flex items-center justify-between gap-3 rounded-[14px] p-2.5 hover:bg-white/8">
                    <div className="flex items-center gap-3">
                      <Avatar name={user.username} size={38} online={user.isOnline} />
                      <div className="leading-tight">
                        <div className="text-[15px] font-[600]">{user.username}</div>
                        <div className="text-[11.5px] text-[#a0a0b0]">{user.isOnline ? "онлайн" : "был(а) " + new Date(user.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                      </div>
                    </div>
                    <button onClick={() => handleStartChat(user)} className="rounded-[12px] bg-[#6c63ff] px-3.5 py-1.5 text-[13px] font-[650] shadow-[0_6px_20px_rgba(108,99,255,0.35)] hover:bg-[#5d55e6]">Написать</button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat List */}
      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="max-w-[320px]">
              <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-[#1a1a2e]">
                <Search size={26} className="text-[#8a8aa3]" />
              </div>
              <h3 className="mb-1.5 text-[18px] font-[650]">У вас пока нет переписок</h3>
              <p className="text-[13.5px] leading-[1.55] text-[#a0a0b0]">Найдите пользователя через поиск выше и начните общение. Сообщения нельзя пересылать — только приватный обмен.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.06]">
            {chats.map(chat => (
              <button key={chat.id} onClick={() => setActiveChatId(chat.id)}
                className="group flex w-full items-center gap-3.5 px-4 py-[14px] text-left transition hover:bg-white/[0.04]">
                <Avatar name={chat.otherUser.username} size={48} online={chat.otherUser.isOnline} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15.5px] font-[600]">{chat.otherUser.username}</span>
                    <span className="shrink-0 text-[11px] text-[#8a8aa3]">{chat.lastMessage ? new Date(chat.lastMessage.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[13.5px] text-[#bdbdd0]">{chat.lastMessage?.content || "Нет сообщений"}</p>
                    {chat.unreadCount > 0 && (
                      <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#e94560] px-1.5 text-[11px] font-[700] text-white">{chat.unreadCount > 9 ? "9+" : chat.unreadCount}</span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Side Menu */}
      <AnimatePresence>
        {showUserMenu && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]" onClick={() => setShowUserMenu(false)} />
            <motion.aside initial={{ x: -320 }} animate={{ x: 0 }} exit={{ x: -320 }} transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="fixed left-0 top-0 z-50 h-dvh w-[300px] border-r border-white/10 bg-[#1a1a2e] p-5 shadow-[24px_0_80px_rgba(0,0,0,0.55)]">
              <div className="mb-6 flex items-center gap-3">
                <Avatar name={currentUser.username} size={44} online />
                <div className="leading-tight">
                  <div className="text-[16px] font-[650]">{currentUser.username}</div>
                  <div className="text-[11.5px] text-[#a0a0b0]">Приватный аккаунт</div>
                </div>
              </div>

              <nav className="space-y-1.5 text-[14.5px]">
                {[
                  { icon: Settings, label: "Настройки", desc: "Скоро", disabled: true },
                  { icon: Info, label: "О приложении", desc: "botellón v0.1", disabled: true },
                ].map(item => (
                  <button key={item.label} disabled={item.disabled}
                    className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-3 text-left hover:bg-white/8 disabled:opacity-50 disabled:cursor-not-allowed">
                    <item.icon size={18} />
                    <div className="leading-tight">
                      <div className="font-[580]">{item.label}</div>
                      <div className="text-[11.5px] text-[#a0a0b0]">{item.desc}</div>
                    </div>
                  </button>
                ))}

                <button onClick={() => { localStorage.removeItem(LS_KEYS.SESSION); useAppStore.getState().setCurrentUser(null); setShowUserMenu(false); toast("Вы вышли из аккаунта", "success"); }}
                  className="mt-4 flex w-full items-center gap-3 rounded-[14px] border border-[#e94560]/30 bg-[#2a1a2e]/60 px-3.5 py-3 font-[600] text-[#ffb3c2] hover:bg-[#3a1f2e]">
                  <LogOut size={18} />
                  Выйти из аккаунта
                </button>
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function ChatPage() {
  const { currentUser, activeChatId, chats, markAsRead, addMessage } = useAppStore();
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<MessageModel[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const toast = useToast();

  const chat = useMemo(() => chats.find(c => c.id === activeChatId), [chats, activeChatId]);

  // Load messages
  useEffect(() => {
    if (!activeChatId) return;
    api.getMessages(activeChatId).then(setMessages);
    markAsRead(activeChatId);
  }, [activeChatId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [input]);

  // Socket: listen for new messages
  useEffect(() => {
    const off = socket.on("message:new", (msg: MessageModel) => {
      if (msg.chatId === activeChatId) {
        setMessages(prev => [...prev, msg]);
        markAsRead(activeChatId!);
      }
    });
    return () => { off(); };
  }, [activeChatId, markAsRead]);

  const handleSend = async () => {
    if (!input.trim() || !activeChatId || !currentUser) return;
    const content = input.trim();
    setInput("");
    const tempId = "temp_" + Date.now();
    const optimistic: MessageModel = { id: tempId, chatId: activeChatId, senderId: currentUser.id, content, createdAt: Date.now(), isRead: false };
    setMessages(prev => [...prev, optimistic]);

    try {
      const realMsg = await api.sendMessage(activeChatId, currentUser.id, content);
      setMessages(prev => prev.map(m => m.id === tempId ? realMsg : m));
      addMessage(realMsg);
      socket.emit("message:new", realMsg); // broadcast
    } catch {
      setMessages(prev => prev.filter(m => m.id !== tempId));
      toast("Не удалось отправить сообщение", "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!chat || !currentUser) return null;

  return (
    <div className="flex h-dvh w-full flex-col bg-[#0f0f23] text-white antialiased select-none">
      {/* Top Bar */}
      <header className="z-30 flex h-[64px] items-center gap-3 border-b border-white/10 bg-[#1a1a2e]/80 px-3 backdrop-blur-xl">
        <button onClick={() => useAppStore.getState().setActiveChatId(null)} className="rounded-xl p-2.5 hover:bg-white/10">
          <ArrowLeft size={22} />
        </button>
        <Avatar name={chat.otherUser.username} size={40} online={chat.otherUser.isOnline} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-[650]">{chat.otherUser.username}</div>
          <div className="text-[11.5px] text-[#a0a0b0]">{chat.otherUser.isOnline ? "онлайн" : "был(а) " + new Date(chat.otherUser.lastSeen).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
        </div>
      </header>

      {/* Messages */}
      <div className="relative flex-1 overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto px-4 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-1.5 pb-2">
            {messages.map((msg, i) => {
              const isMe = msg.senderId === currentUser.id;
              const prev = messages[i - 1];
              const showAvatar = !prev || prev.senderId !== msg.senderId;
              return (
                <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "justify-end" : "justify-start"}`}>
                  {!isMe && showAvatar && <Avatar name={chat.otherUser.username} size={28} />}
                  {!isMe && !showAvatar && <div className="w-[28px] shrink-0"/>}

                  <div className={`relative max-w-[78%] select-none`}>
                    <div className={`relative rounded-[18px] px-3.5 py-2.5 text-[14.8px] leading-[1.45] shadow-[0_4px_24px_rgba(0,0,0,0.35)] ${isMe ? "rounded-br-[6px] bg-gradient-to-br from-[#6c63ff] to-[#5a52e8] text-white" : "rounded-bl-[6px] bg-[#1a1a2e] text-[#eaeaf3]"}`}>
                      <p className="whitespace-pre-wrap break-words [word-break:break-word]">{msg.content}</p>
                      <div className={`mt-1 flex items-center justify-end gap-1 text-[10.5px] ${isMe ? "text-white/70" : "text-[#a0a0b0]"}`}>
                        <span>{new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        {isMe && (msg.isRead ? <CheckCheck size={12} /> : <Check size={12} />)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      {/* Input Bar */}
      <div className="relative border-t border-white/10 bg-[#1a1a2e]/80 px-3 py-3 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[720px] items-end gap-2.5 rounded-[20px] border border-white/12 bg-[#16213e]/70 px-3.5 py-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="Написать сообщение..." rows={1}
            className="max-h-[120px] min-h-[38px] flex-1 resize-none bg-transparent text-[15px] font-[500] leading-[1.45] outline-none placeholder:text-[#7a7a92] selection:bg-[#6c63ff]/30" />
          <button onClick={handleSend} disabled={!input.trim()}
            className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-[14px] bg-[#6c63ff] text-white shadow-[0_6px_20px_rgba(108,99,255,0.45)] transition hover:bg-[#5d55e6] disabled:opacity-50 disabled:shadow-none">
            <Send size={18} />
          </button>
        </div>
        <p className="mx-auto mt-2 w-full max-w-[720px] text-[10.5px] text-[#7a7a92]">Shift+Enter — перенос строки • Enter — отправить • Пересылка недоступна</p>
      </div>
    </div>
  );
}

// =========================
// Main App Component
// =========================
export default function App() {
  const [toasts, setToasts] = useState<{ id: string; msg: string; type: "success" | "error" }[]>([]);
  const [authView, setAuthView] = useState<"register" | "login">("register");
  const { currentUser, activeChatId, setCurrentUser } = useAppStore();

  const addToast = (msg: string, type: "success" | "error" = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200);
  };

  // Check session on mount
  useEffect(() => {
    (async () => {
      const user = await api.me();
      if (user) {
        setCurrentUser(user);
        useAppStore.getState().loadChats();
      }
    })();
  }, [setCurrentUser]);

  // Start simulation heartbeat
  useEffect(() => { startMessageSimulator(); }, []);

  return (
    <ToastContext.Provider value={addToast}>
      <div className="h-dvh w-full overflow-hidden bg-[#0f0f23] font-sans text-[15px] antialiased [font-feature-settings:'ss01','cv01','cv02']">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;650;700&family=Instrument+Serif:ital@0;1&display=swap');
          * { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
          ::selection { background: rgba(108,99,255,0.25); }
          .select-none { -webkit-user-select: none; user-select: none; }
        `}</style>

        {!currentUser ? (
          authView === "register" ? (
            <RegisterPage onSwitchToLogin={() => setAuthView("login")} />
          ) : (
            <LoginPage onSwitchToRegister={() => setAuthView("register")} />
          )
        ) : activeChatId ? (
          <ChatPage />
        ) : (
          <ChatsPage />
        )}

        <ToastContainer toasts={toasts} remove={id => setToasts(t => t.filter(x => x.id !== id))} />
      </div>
    </ToastContext.Provider>
  );
}
// Zod-like runtime validation helper (future feature placeholder)
// TODO: Add zod for API input validation when backend is connected
// TODO: Add file/image upload support in ChatInput
// TODO: Add group chats model and UI
// TODO: Add end-to-end encryption toggle
