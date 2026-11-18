import type { ConversationSession, TranscriptMessage } from "../../types/jarvis";

const STORAGE_KEY = "jarvis_conversations_v1";
const ACTIVE_SESSION_KEY = "jarvis_active_session_v1";

export interface ConversationRepository {
  listSessions(): ConversationSession[];
  getActiveSessionId(): string | null;
  setActiveSessionId(id: string): void;
  saveSession(session: ConversationSession): void;
  createSession(title?: string): ConversationSession;
  deleteSession(id: string): void;
  clearAll(): void;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function deriveSessionTitle(messages: TranscriptMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user" && m.text.trim().length > 0);
  if (!firstUser) return "Nouvelle session";
  const cleaned = firstUser.text.trim().replace(/\s+/g, " ");
  return cleaned.length > 42 ? `${cleaned.slice(0, 42)}…` : cleaned;
}

class LocalConversationRepository implements ConversationRepository {
  public listSessions(): ConversationSession[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item): item is ConversationSession =>
            typeof item === "object" &&
            item !== null &&
            typeof (item as ConversationSession).id === "string" &&
            Array.isArray((item as ConversationSession).messages)
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch {
      return [];
    }
  }

  public getActiveSessionId(): string | null {
    try {
      return localStorage.getItem(ACTIVE_SESSION_KEY);
    } catch {
      return null;
    }
  }

  public setActiveSessionId(id: string): void {
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, id);
    } catch {
      // Ignore quota errors
    }
  }

  public saveSession(session: ConversationSession): void {
    const existing = this.listSessions();
    const next = existing.filter((s) => s.id !== session.id);
    next.unshift(session);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next.slice(0, 40)));
    } catch {
      // Ignore quota errors
    }
  }

  public createSession(title = "Nouvelle session"): ConversationSession {
    const now = Date.now();
    const session: ConversationSession = {
      id: generateId(),
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    this.saveSession(session);
    this.setActiveSessionId(session.id);
    return session;
  }

  public deleteSession(id: string): void {
    const remaining = this.listSessions().filter((s) => s.id !== id);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // Ignore
    }
  }

  public clearAll(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } catch {
      // Ignore
    }
  }
}

export const conversationRepository: ConversationRepository =
  new LocalConversationRepository();
