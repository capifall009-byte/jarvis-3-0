import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Mic, X } from "lucide-react";
import { ChatSidebar } from "./components/ChatSidebar";
import { ControlDock } from "./components/ControlDock";
import { HistoryDrawer } from "./components/HistoryDrawer";
import { JarvisOrb } from "./components/JarvisOrb";
import { NavShell } from "./components/NavShell";
import { TranscriptStream } from "./components/TranscriptStream";
import { FilesView } from "./components/views/FilesView";
import { HomeView } from "./components/views/HomeView";
import { MemoryView } from "./components/views/MemoryView";
import { SettingsView } from "./components/views/SettingsView";
import { NewsView } from "./components/views/NewsView";
import { SocialHubView } from "./components/views/SocialHubView";
import { ModeSelector } from "./components/ModeSelector";
import { VideoView } from "./components/views/VideoView";
import { AiVideoStudioView } from "./components/views/AiVideoStudioView";
import { WebSearchView } from "./components/views/WebSearchView";
import { IntelligenceView } from "./components/views/IntelligenceView";
import { AudioEngine } from "./services/audio/AudioEngine";
import {
  getDefaultVocalStyle,
  getVocalPreset,
  isVocalStyleActive,
  loadVocalStyle,
  saveVocalStyle,
  detectAutoEmotion,
} from "./services/audio/VocalStyleService";
import {
  clearStoredFiles,
  listStoredFiles,
} from "./services/files/FileVaultRepository";
import { streamGeminiResponse } from "./services/gemini/GeminiClient";
import { detectSensitiveMemory, memoryRepository } from "./services/memory/MemoryRepository";
import {
  getActiveModeId,
  setActiveModeId,
  listCustomModes,
  saveCustomMode,
  deleteCustomMode,
  setCustomModeActive,
  resolveMode,
  composeModeInstructions,
} from "./services/modes/ModeRepository";
import {
  executeOfflineCommand,
  useOnlineStatus,
} from "./services/offline/OfflineEngine";
import { SpeechInput } from "./services/speech/SpeechInput";
import {
  conversationRepository,
  deriveSessionTitle,
} from "./services/storage/ConversationRepository";
import { clearSavedSearches } from "./services/web/WebSearchClient";
import {
  addIntelligenceHistory,
  clearIntelligenceHistory,
  listIntelligenceHistory,
  loadIntelligenceProfile,
  saveIntelligenceProfile,
} from "./services/intelligence/IntelligenceRepository";
import {
  clearProjects,
  createProject,
  listProjects,
  removeProject,
  saveProject,
} from "./services/projects/ProjectRepository";
import {
  TONE_PROSODY_PROFILES,
  analyzeUserSentiment,
} from "../shared/sentiment.ts";
import type { JarvisTone, SentimentAnalysis } from "../shared/sentiment.ts";
import type {
  AppView,
  ConnectionErrorInfo,
  ConversationSession,
  CustomMode,
  IntelligenceHistoryEvent,
  IntelligenceProfile,
  JarvisMode,
  MemoryCategory,
  MemoryItem,
  ProjectItem,
  StoredFileItem,
  TranscriptMessage,
  VocalStyle,
  VoiceState,
} from "./types/jarvis";

const EXTREME_DARK_STORAGE_KEY = "jarvis_extreme_dark_v1";

function prosodyToTts(p: { rate: number; pitch: number; expressiveness: number }): {
  rate: string;
  pitch: string;
  volume: string;
} {
  const ratePct = Math.round((p.rate - 1) * 100);
  const pitchHz = Math.round((p.pitch - 1) * 60);
  return {
    rate: `${ratePct >= 0 ? "+" : ""}${ratePct}%`,
    pitch: `${pitchHz >= 0 ? "+" : ""}${pitchHz}Hz`,
    volume: "+0%",
  };
}

const VALID_VIEWS: AppView[] = [
  "home",
  "conversations",
  "memory",
  "search",
  "files",
  "video",
  "aiVideo",
  "settings",
  "news",
  "social",
  "intelligence",
];

function createMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const VOICE_STATUS_TEXT: Record<VoiceState, string> = {
  idle: "EN ATTENTE",
  connecting: "INITIALISATION",
  listening: "ÉCOUTE",
  speaking: "PAROLE",
  thinking: "RÉFLEXION",
  offline: "HORS LIGNE",
  error: "INCIDENT",
};

/**
 * Extracts completed sentences from a streaming buffer for low-latency progressive TTS.
 */
function popReadySentence(buffer: string): {
  sentence: string | null;
  rest: string;
} {
  const match = buffer.match(/^([\s\S]{18,}?[.!?…\n]+)(?:\s+|$)([\s\S]*)$/);
  if (match) {
    return {
      sentence: match[1].trim(),
      rest: match[2],
    };
  }
  if (buffer.length > 140) {
    const clauseMatch = buffer.match(/^([\s\S]{60,}?[,;:])\s+([\s\S]*)$/);
    if (clauseMatch) {
      return {
        sentence: clauseMatch[1].trim(),
        rest: clauseMatch[2],
      };
    }
  }
  return { sentence: null, rest: buffer };
}

export default function App() {
  const isOnline = useOnlineStatus();

  const [activeView, setActiveView] = useState<AppView>("home");
  const [composerDraft, setComposerDraft] = useState("");
  const [sessions, setSessions] = useState<ConversationSession[]>(() => {
    const list = conversationRepository.listSessions();
    if (list.length > 0) return list;
    return [conversationRepository.createSession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const savedId = conversationRepository.getActiveSessionId();
    const list = conversationRepository.listSessions();
    if (savedId && list.some((s) => s.id === savedId)) {
      return savedId;
    }
    return list[0]?.id ?? "";
  });

  const [memories, setMemories] = useState<MemoryItem[]>(() =>
    memoryRepository.listMemories()
  );
  const [storedFiles, setStoredFiles] = useState<StoredFileItem[]>([]);
  const [projects, setProjects] = useState<ProjectItem[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [intelligenceProfile, setIntelligenceProfile] = useState<IntelligenceProfile>(() =>
    loadIntelligenceProfile()
  );
  const [intelligenceHistory, setIntelligenceHistory] = useState<IntelligenceHistoryEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [isSending, setIsSending] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [geminiModel, setGeminiModel] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [errorInfo, setErrorInfo] = useState<ConnectionErrorInfo | null>(null);
  const [memoryToast, setMemoryToast] = useState<string | null>(null);
  const [siriListenPending, setSiriListenPending] = useState(false);
  const [isExtremeDark, setIsExtremeDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem(EXTREME_DARK_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [liveDraftText, setLiveDraftText] = useState("");
  const [activeTone, setActiveTone] = useState<JarvisTone>("neutral");

  const [activeModeId, setActiveModeIdState] = useState<string>(() => getActiveModeId());
  const [customModes, setCustomModes] = useState<CustomMode[]>([]);
  const [activeMode, setActiveMode] = useState<JarvisMode | null>(null);

  const [vocalStyle, setVocalStyle] = useState<VocalStyle>(() => loadVocalStyle());

  const audioEngineRef = useRef<AudioEngine | null>(null);
  const speechInputRef = useRef<SpeechInput | null>(null);
  const requestAbortRef = useRef<AbortController | null>(null);
  const voiceStateRef = useRef<VoiceState>(voiceState);
  const activeSessionIdRef = useRef<string>(activeSessionId);
  const sessionsRef = useRef<ConversationSession[]>(sessions);
  const memoriesRef = useRef<MemoryItem[]>(memories);
  const projectsRef = useRef<ProjectItem[]>(projects);
  const intelligenceProfileRef = useRef<IntelligenceProfile>(intelligenceProfile);
  const activeModeRef = useRef<JarvisMode | null>(activeMode);
  const vocalStyleRef = useRef<VocalStyle>(vocalStyle);
  const storedFilesRef = useRef<StoredFileItem[]>(storedFiles);
  const isOnlineRef = useRef<boolean>(isOnline);
  const intentHandledRef = useRef(false);

  useEffect(() => {
    voiceStateRef.current = voiceState;
  }, [voiceState]);

  useEffect(() => {
    activeSessionIdRef.current = activeSessionId;
    if (activeSessionId) {
      conversationRepository.setActiveSessionId(activeSessionId);
    }
  }, [activeSessionId]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    intelligenceProfileRef.current = intelligenceProfile;
    // garder la mémoire globale synchronisée
    memoryRepository.setMemoryEnabled(intelligenceProfile.memoryEnabled);
  }, [intelligenceProfile]);

  useEffect(() => {
    activeModeRef.current = activeMode;
  }, [activeMode]);

  useEffect(() => {
    vocalStyleRef.current = vocalStyle;
    saveVocalStyle(vocalStyle);
    const engine = audioEngineRef.current;
    if (!engine) return;
    if (isVocalStyleActive(vocalStyle)) {
      engine.setVocalStyle(vocalStyle);
    } else {
      // Réinitialiser vers le style neutre sans surcharger la prosodie des modes
      engine.setVocalStyle(getDefaultVocalStyle());
    }
  }, [vocalStyle]);

  useEffect(() => {
    storedFilesRef.current = storedFiles;
  }, [storedFiles]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    document.documentElement.classList.toggle("extreme-dark", isExtremeDark);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", isExtremeDark ? "#000000" : "#020408");
    }
    try {
      localStorage.setItem(EXTREME_DARK_STORAGE_KEY, String(isExtremeDark));
    } catch {
      // Ignore storage quota errors
    }
  }, [isExtremeDark]);

  const reloadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const items = await listProjects();
      setProjects(items);
    } catch (e) {
      setProjectsError(
        e instanceof Error ? e.message : "Échec du chargement des projets (IndexedDB)."
      );
    } finally {
      setProjectsLoading(false);
    }
  }, []);

  const reloadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const items = await listIntelligenceHistory();
      setIntelligenceHistory(items);
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "Échec du chargement de l'historique (IndexedDB)."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Hydrate persistent memories, file vault, custom modes, projects & intelligence from storage on mount
  useEffect(() => {
    void memoryRepository.hydrateFromIndexedDb().then(setMemories);
    void listStoredFiles().then(setStoredFiles);
    void listCustomModes().then(setCustomModes);
    void reloadProjects();
    void reloadHistory();
  }, [reloadProjects, reloadHistory]);

  useEffect(() => {
    const mode = resolveMode(activeModeId, customModes);
    setActiveMode(mode);
  }, [activeModeId, customModes]);

  const activeSession =
    sessions.find((s) => s.id === activeSessionId) ?? sessions[0];

  // Initialize AudioEngine & SpeechInput singletons
  useEffect(() => {
    const engine = new AudioEngine();
    const speech = new SpeechInput();
    audioEngineRef.current = engine;
    speechInputRef.current = speech;

    // Appliquer le style vocal initial s'il est actif
    const initialVocal = loadVocalStyle();
    if (isVocalStyleActive(initialVocal)) {
      engine.setVocalStyle(initialVocal);
    }

    engine.setCallbacks({
      onSpeakingStart: () => {
        setVoiceState("speaking");
      },
      onSpeakingEnd: () => {
        if (voiceStateRef.current === "speaking") {
          setVoiceState("idle");
        }
      },
      onError: (msg) => {
        setErrorInfo({
          title: "Synthèse vocale",
          detail: msg,
        });
      },
    });

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void engine.resumeIfInterrupted();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      requestAbortRef.current?.abort();
      speech.stop();
      engine.dispose();
    };
  }, []);

  // Verify Google Gemini backend readiness on mount / reconnect
  useEffect(() => {
    if (!isOnline) return;
    fetch("/api/health")
      .then((res) => res.json())
      .then(
        (data: {
          ok?: boolean;
          geminiConfigured?: boolean;
          model?: string | null;
          error?: string;
        }) => {
          if (data.model) {
            setGeminiModel(data.model);
          }
          if (data.geminiConfigured === false || data.ok === false) {
            setErrorInfo({
              title: "Configuration Gemini requise",
              detail:
                data.error ||
                "La clé API GEMINI_API_KEY n'est pas configurée côté serveur.",
            });
          }
        }
      )
      .catch(() => {
        // Ignore transient offline or startup check
      });
  }, [isOnline]);

  const updateSessionMessages = useCallback(
    (
      sessionId: string,
      updater: (messages: TranscriptMessage[]) => TranscriptMessage[]
    ) => {
      setSessions((prev) =>
        prev.map((session) => {
          if (session.id !== sessionId) return session;
          const updatedMessages = updater(session.messages);
          const updatedSession: ConversationSession = {
            ...session,
            messages: updatedMessages,
            title:
              session.title === "Nouvelle session"
                ? deriveSessionTitle(updatedMessages)
                : session.title,
            updatedAt: Date.now(),
          };
          conversationRepository.saveSession(updatedSession);
          return updatedSession;
        })
      );
    },
    []
  );

  const stopAllActivity = useCallback(() => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    speechInputRef.current?.stop();
    audioEngineRef.current?.stopPlayback();
    audioEngineRef.current?.setSyntheticListeningEnergy(0);
    setInterimTranscript("");
    setIsSending(false);
    setVoiceState("idle");
  }, []);

  const speakPlainText = useCallback((text: string) => {
    const trimmed = text.trim();
    const engine = audioEngineRef.current;
    if (!trimmed || !engine) return;
    // Le mute explicite de l'utilisateur doit rester respecté, y compris depuis News/WebSearch.
    if (engine.getMuted()) return;
    engine.prepareOnUserGesture();
    const mode = activeModeRef.current;
    const vs = vocalStyleRef.current;
    const useVocal = isVocalStyleActive(vs);
    // En mode auto, l'émotion est détectée avant le tour vocal : elle influence donc bien la voix.
    const speechVs =
      useVocal && vs.auto
        ? { ...vs, emotion: detectAutoEmotion(trimmed, mode?.tone ?? "neutral") }
        : vs;
    const genId = engine.beginSpeechTurn(
      mode?.tone ?? "neutral",
      mode && !useVocal ? prosodyToTts(mode.prosody) : null,
      useVocal ? speechVs : null
    );
    let buffer = trimmed;
    let extracted = popReadySentence(buffer);
    while (extracted.sentence) {
      engine.enqueueSentence(extracted.sentence, genId);
      buffer = extracted.rest;
      extracted = popReadySentence(buffer);
    }
    if (buffer.trim()) {
      engine.enqueueSentence(buffer.trim(), genId);
    }
    engine.markStreamComplete(genId);
  }, []);

  const handleNewSession = useCallback(() => {
    stopAllActivity();
    const created = conversationRepository.createSession();
    setSessions(conversationRepository.listSessions());
    setActiveSessionId(created.id);
    setErrorInfo(null);
  }, [stopAllActivity]);

  const submitToGemini = useCallback(
    async (text: string, source: "voice" | "text") => {
      const trimmed = text.trim();
      if (!trimmed) return;

      requestAbortRef.current?.abort();
      audioEngineRef.current?.stopPlayback();
      setErrorInfo(null);

      const sessionId = activeSessionIdRef.current;
      const priorMessages =
        sessionsRef.current.find((s) => s.id === sessionId)?.messages ?? [];
      const recentUserTexts = priorMessages
        .filter((m) => m.role === "user")
        .map((m) => m.text);
      const instantSentiment = analyzeUserSentiment(trimmed, recentUserTexts);

      const userMsg: TranscriptMessage = {
        id: createMsgId(),
        role: "user",
        text: trimmed,
        timestamp: Date.now(),
        source,
        sentiment: instantSentiment,
      };
      const assistantMsgId = createMsgId();

      updateSessionMessages(sessionId, (msgs) => [...msgs, userMsg]);

      // Honest Offline Mode: execute local commands, never pretend Gemini works offline
      if (!isOnlineRef.current) {
        const offlineResult = executeOfflineCommand(trimmed, {
          memories: memoriesRef.current,
          sessions: sessionsRef.current,
          files: storedFilesRef.current,
          onToggleExtremeDark: (force) =>
            setIsExtremeDark((prev) => (typeof force === "boolean" ? force : !prev)),
          onNewSession: handleNewSession,
        });

        updateSessionMessages(sessionId, (msgs) => [
          ...msgs,
          {
            id: assistantMsgId,
            role: "assistant",
            text: offlineResult.reply,
            timestamp: Date.now(),
            source: "text",
            tone: "calm",
          },
        ]);

        const engine = audioEngineRef.current;
        if (engine && !engine.getMuted()) {
          const genId = engine.beginSpeechTurn("calm");
          engine.enqueueSentence(offlineResult.reply, genId);
          engine.markStreamComplete(genId);
        }
        return;
      }

      const controller = new AbortController();
      requestAbortRef.current = controller;

      setIsSending(true);
      setVoiceState("thinking");
      setActiveTone(instantSentiment.tone);

      const engine = audioEngineRef.current;
      const activeModeForSpeech = activeModeRef.current;
      const vs = vocalStyleRef.current;
      const useVocal = isVocalStyleActive(vs);
      const speechVs =
        useVocal && vs.auto
          ? {
              ...vs,
              emotion: detectAutoEmotion(trimmed, instantSentiment.tone),
            }
          : vs;
      const vocalPreset = useVocal ? getVocalPreset(speechVs) : null;
      const speechGenId = engine
        ? engine.beginSpeechTurn(
            activeModeForSpeech?.tone ?? instantSentiment.tone,
            activeModeForSpeech && !useVocal
              ? prosodyToTts(activeModeForSpeech.prosody)
              : null,
            useVocal ? speechVs : null
          )
        : 0;
      let resolvedTurnTone: JarvisTone = instantSentiment.tone;
      let ttsSentenceBuffer = "";
      let assistantCreated = false;

      try {
        const profile = intelligenceProfileRef.current;
        const contextProjects = projectsRef.current
          .filter((p) => p.status !== "archived")
          .slice(0, 8)
          .map((p) => ({
            id: p.id,
            name: p.name,
            objective: p.objective,
            status: p.status,
            progress: p.progress,
            nextActions: p.nextActions,
            blockers: p.blockers.filter((b) => !b.resolvedAt).map((b) => b.description),
          }));

        const result = await streamGeminiResponse({
          message: trimmed,
          history: priorMessages,
          memories: memoryRepository.getContextMemories(activeModeRef.current?.id),
          mode: activeModeRef.current
            ? {
                id: activeModeRef.current.id,
                name: activeModeRef.current.name,
                instructions: composeModeInstructions(activeModeRef.current),
              }
            : undefined,
          vocalStyle: useVocal
            ? {
                emotion: vs.emotion,
                personality: vs.personality,
                intensity: vs.intensity,
                auto: vs.auto,
                geminiInstruction: vocalPreset?.geminiInstruction,
              }
            : undefined,
          intelligenceProfile: {
            baseTone: profile.baseTone,
            humorLevel: profile.humorLevel,
            sarcasmLevel: profile.sarcasmLevel,
            proactivityLevel: profile.proactivityLevel,
            detailPreference: profile.detailPreference,
            askWhenMissingInfo: profile.askWhenMissingInfo,
            memoryEnabled: profile.memoryEnabled,
          },
          projects: contextProjects,
          signal: controller.signal,
          onMeta: (model, serverSentiment) => {
            if (model) setGeminiModel(model);
            if (serverSentiment) {
              resolvedTurnTone = serverSentiment.tone;
              setActiveTone(serverSentiment.tone);
              engine?.setTurnTone(serverSentiment.tone, speechGenId);
            }
          },
          onTone: (tone) => {
            resolvedTurnTone = tone;
            setActiveTone(tone);
            engine?.setTurnTone(tone, speechGenId);
            if (assistantCreated) {
              updateSessionMessages(sessionId, (msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId ? { ...m, tone } : m
                )
              );
            }
          },
          onDelta: (cleanAccumulated, newChunk) => {
            if (!assistantCreated) {
              assistantCreated = true;
              setIsSending(false);
              updateSessionMessages(sessionId, (msgs) => [
                ...msgs,
                {
                  id: assistantMsgId,
                  role: "assistant",
                  text: cleanAccumulated,
                  timestamp: Date.now(),
                  source: engine && !engine.getMuted() ? "voice" : "text",
                  isPartial: true,
                  tone: resolvedTurnTone,
                },
              ]);
            } else {
              updateSessionMessages(sessionId, (msgs) =>
                msgs.map((m) =>
                  m.id === assistantMsgId
                    ? { ...m, text: cleanAccumulated, tone: resolvedTurnTone }
                    : m
                )
              );
            }

            if (engine && !engine.getMuted()) {
              ttsSentenceBuffer += newChunk;
              let extracted = popReadySentence(ttsSentenceBuffer);
              while (extracted.sentence) {
                engine.enqueueSentence(extracted.sentence, speechGenId);
                ttsSentenceBuffer = extracted.rest;
                extracted = popReadySentence(ttsSentenceBuffer);
              }
            }
          },
        });

        if (controller.signal.aborted) return;

        const finalTone = result.tone || resolvedTurnTone;
        setActiveTone(finalTone);
        engine?.setTurnTone(finalTone, speechGenId);

        if (!assistantCreated) {
          updateSessionMessages(sessionId, (msgs) => [
            ...msgs,
            {
              id: assistantMsgId,
              role: "assistant",
              text: result.reply,
              timestamp: Date.now(),
              source: engine && !engine.getMuted() ? "voice" : "text",
              isPartial: false,
              tone: finalTone,
            },
          ]);
        } else {
          updateSessionMessages(sessionId, (msgs) =>
            msgs.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    text: result.reply,
                    isPartial: false,
                    tone: finalTone,
                  }
                : m
            )
          );
        }

        if (engine && !engine.getMuted()) {
          const remainder = ttsSentenceBuffer.trim();
          if (remainder.length > 0) {
            engine.enqueueSentence(remainder, speechGenId);
          } else if (!assistantCreated && result.reply) {
            engine.enqueueSentence(result.reply, speechGenId);
          }
          engine.markStreamComplete(speechGenId);
        }

        // Mémoire évolutive: auto-enregistrement uniquement si autorisé et non sensible
        if (result.extractedMemories.length > 0) {
          if (!profile.memoryEnabled) {
            setMemoryToast("Mémoire désactivée : rien n'a été enregistré.");
            setTimeout(() => setMemoryToast(null), 4000);
          } else {
            let savedCount = 0;
            let blockedSensitive = 0;
            for (const fact of result.extractedMemories) {
              const sensitive = detectSensitiveMemory(fact);
              if (sensitive && !profile.autoSaveSensitive) {
                blockedSensitive += 1;
                void addIntelligenceHistory({
                  type: "memory_update",
                  title: "Mémoire sensible non enregistrée automatiquement",
                  detail: "Une information potentiellement sensible a été détectée dans une demande de mémorisation et n'a pas été enregistrée sans autorisation explicite.",
                  level: "warning",
                  relatedConversationId: sessionId,
                }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
                continue;
              }
              const added = memoryRepository.addMemory(
                fact,
                undefined,
                activeModeRef.current?.id,
                { source: "assistant", kind: "fact", sensitive }
              );
              if (added) {
                savedCount += 1;
                void addIntelligenceHistory({
                  type: "memory_update",
                  title: "Souvenir enregistré",
                  detail: added.fact,
                  level: "info",
                  relatedConversationId: sessionId,
                }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
              }
            }
            if (savedCount > 0 || blockedSensitive > 0) {
              setMemories(memoryRepository.listMemories());
            }
            if (blockedSensitive > 0) {
              setMemoryToast("Information sensible détectée : mémorisation automatique bloquée (autorisation requise).");
            } else if (savedCount > 0) {
              setMemoryToast(savedCount === 1 ? "Souvenir enregistré." : `${savedCount} souvenirs enregistrés.`);
            }
            if (savedCount > 0 || blockedSensitive > 0) {
              setTimeout(() => setMemoryToast(null), 4500);
            }
          }
        }

        if (voiceStateRef.current === "thinking") {
          setVoiceState("idle");
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        engine?.stopPlayback();
        setVoiceState("error");
        const detail =
          err instanceof Error
            ? err.message
            : "Impossible d'obtenir une réponse de l'API Google Gemini.";
        setErrorInfo({
          title: "Erreur de communication avec Gemini",
          detail,
        });
        void addIntelligenceHistory({
          type: "error",
          title: "Erreur Gemini / réseau",
          detail,
          level: "warning",
          relatedConversationId: sessionId,
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
      } finally {
        if (requestAbortRef.current === controller) {
          requestAbortRef.current = null;
        }
        setIsSending(false);
      }
    },
    [handleNewSession, updateSessionMessages]
  );

  const startMicrophoneListening = useCallback(() => {
    const engine = audioEngineRef.current;
    const speech = speechInputRef.current;
    if (!engine || !speech) return;

    engine.prepareOnUserGesture();

    setSiriListenPending(false);
    requestAbortRef.current?.abort();
    engine.stopPlayback();
    setErrorInfo(null);
    setInterimTranscript("");

    const started = speech.start({
      onStart: () => {
        setVoiceState("listening");
        engine.setSyntheticListeningEnergy(0.18);
      },
      onInterim: (text) => {
        setInterimTranscript(text);
        engine.setSyntheticListeningEnergy(0.45 + (text.length % 5) * 0.08);
      },
      onFinal: (finalText) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        void submitToGemini(finalText, "voice");
      },
      onVoiceCommand: (command) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        if (command === "stop_speech") {
          stopAllActivity();
        } else if (command === "new_session") {
          handleNewSession();
        }
      },
      onError: (title, detail) => {
        setInterimTranscript("");
        engine.setSyntheticListeningEnergy(0);
        setVoiceState("error");
        setErrorInfo({ title, detail, isMicError: true });
      },
      onEnd: () => {
        engine.setSyntheticListeningEnergy(0);
        setInterimTranscript("");
        if (voiceStateRef.current === "listening") {
          setVoiceState("idle");
        }
      },
    });

    if (!started) {
      engine.setSyntheticListeningEnergy(0);
    }
  }, [handleNewSession, stopAllActivity, submitToGemini]);

  const handleToggleMic = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    if (voiceStateRef.current === "listening") {
      speechInputRef.current?.stop();
      audioEngineRef.current?.setSyntheticListeningEnergy(0);
      setInterimTranscript("");
      setVoiceState("idle");
    } else {
      startMicrophoneListening();
    }
  }, [startMicrophoneListening]);

  const handleToggleMute = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    setIsMuted((prev) => {
      const next = !prev;
      audioEngineRef.current?.setMuted(next);
      return next;
    });
  }, []);

  const handleOrbClick = useCallback(() => {
    audioEngineRef.current?.prepareOnUserGesture();
    if (
      voiceStateRef.current === "speaking" ||
      voiceStateRef.current === "thinking"
    ) {
      stopAllActivity();
    } else {
      handleToggleMic();
    }
  }, [handleToggleMic, stopAllActivity]);

  const handleSendText = useCallback(
    (text: string) => {
      audioEngineRef.current?.prepareOnUserGesture();
      speechInputRef.current?.stop();
      setInterimTranscript("");
      setSiriListenPending(false);
      void submitToGemini(text, "text");
    },
    [submitToGemini]
  );

  // Handle iOS Siri Shortcuts / PWA Shortcuts URL Navigation Intents on mount
  useEffect(() => {
    if (intentHandledRef.current) return;
    intentHandledRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const action = params.get("action")?.toLowerCase();
    const viewParam = params.get("view")?.toLowerCase() as AppView | undefined;
    const query = (params.get("q") || params.get("prompt") || "").trim();
    const wantNew = params.get("new") === "1" || action === "new";
    const wantMute = params.get("mute") === "1";

    if (!action && !viewParam && !query && !wantNew && !wantMute) {
      return;
    }

    if (viewParam && VALID_VIEWS.includes(viewParam)) {
      setActiveView(viewParam);
    }

    if (wantMute) {
      setIsMuted(true);
      audioEngineRef.current?.setMuted(true);
    }

    if (wantNew) {
      const created = conversationRepository.createSession();
      setSessions(conversationRepository.listSessions());
      setActiveSessionId(created.id);
      activeSessionIdRef.current = created.id;
    }

    window.history.replaceState({}, "", window.location.pathname);

    if (query) {
      setActiveView("conversations");
      void submitToGemini(query, "voice");
    } else if (action === "listen") {
      setActiveView("conversations");
      setSiriListenPending(true);
    }
  }, [submitToGemini]);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === activeSessionIdRef.current) return;
      stopAllActivity();
      setActiveSessionId(id);
      setActiveView("conversations");
      setErrorInfo(null);
    },
    [stopAllActivity]
  );

  const handleDeleteSession = useCallback((id: string) => {
    conversationRepository.deleteSession(id);
    let updated = conversationRepository.listSessions();
    if (updated.length === 0) {
      const fresh = conversationRepository.createSession();
      updated = [fresh];
    }
    setSessions(updated);
    if (activeSessionIdRef.current === id) {
      setActiveSessionId(updated[0].id);
    }
  }, []);

  const handleRenameSession = useCallback((id: string, title: string) => {
    const clean = String(title || "").trim();
    if (!clean) return;
    setSessions((prev) => {
      const next = prev.map((s) =>
        s.id === id ? { ...s, title: clean, updatedAt: Date.now() } : s
      );
      const target = next.find((s) => s.id === id);
      if (target) conversationRepository.saveSession(target);
      return next;
    });
  }, []);

  const handleRegenerate = useCallback(
    (assistantMessageId: string) => {
      const msgs = activeSession?.messages ?? [];
      const index = msgs.findIndex((m) => m.id === assistantMessageId);
      for (let i = index - 1; i >= 0; i -= 1) {
        if (msgs[i].role === "user") {
          handleSendText(msgs[i].text);
          return;
        }
      }
    },
    [activeSession, handleSendText]
  );

  const handleAddMemory = useCallback(
    (fact: string, category: MemoryCategory = "autre") => {
      const added = memoryRepository.addMemory(fact, category, undefined, {
        source: "user",
        kind: "fact",
      });
      if (added) {
        setMemories(memoryRepository.listMemories());
        void addIntelligenceHistory({
          type: "memory_update",
          title: "Souvenir ajouté manuellement",
          detail: added.fact,
          level: "info",
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
      }
    },
    []
  );

  const handleUpdateMemory = useCallback(
    (id: string, fact: string, category: MemoryCategory) => {
      const updated = memoryRepository.updateMemory(id, fact, category);
      if (updated) {
        setMemories(memoryRepository.listMemories());
        void addIntelligenceHistory({
          type: "memory_update",
          title: "Souvenir modifié",
          detail: updated.fact,
          level: "info",
        }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
      }
    },
    []
  );

  const handleTogglePinMemory = useCallback((id: string) => {
    const updated = memoryRepository.togglePinMemory(id);
    if (updated) {
      setMemories(memoryRepository.listMemories());
    }
  }, []);

  const handleToggleDisableMemory = useCallback((id: string) => {
    const updated = memoryRepository.toggleDisableMemory(id);
    if (updated) {
      setMemories(memoryRepository.listMemories());
      void addIntelligenceHistory({
        type: "memory_update",
        title: updated.disabled ? "Souvenir désactivé" : "Souvenir réactivé",
        detail: updated.fact,
        level: "info",
      }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
    }
  }, []);

  const handleRemoveMemory = useCallback((id: string) => {
    memoryRepository.removeMemory(id);
    setMemories(memoryRepository.listMemories());
    void addIntelligenceHistory({
      type: "memory_update",
      title: "Souvenir supprimé",
      level: "warning",
    }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
  }, []);

  const handleSetMemoryEnabled = useCallback((enabled: boolean) => {
    memoryRepository.setMemoryEnabled(enabled);
    setIntelligenceProfile((prev) => {
      const next = saveIntelligenceProfile({ ...prev, memoryEnabled: enabled });
      return next;
    });
    void addIntelligenceHistory({
      type: "memory_update",
      title: enabled ? "Mémoire activée" : "Mémoire désactivée",
      level: "info",
    }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
  }, []);

  const handleUpdateIntelligenceProfile = useCallback((patch: Partial<IntelligenceProfile>) => {
    setIntelligenceProfile((prev) => saveIntelligenceProfile({ ...prev, ...patch }));
  }, []);

  const handleToggleExtremeDark = useCallback(() => {
    setIsExtremeDark((prev) => !prev);
  }, []);

  const handleSelectMode = useCallback((id: string) => {
    setActiveModeIdState(id);
    setActiveModeId(id);
  }, []);

  const handleSaveCustomMode = useCallback(
    async (draft: {
      name: string;
      description: string;
      personality: string;
      instructions: string;
      voiceBehavior: { rate: number; pitch: number; expressiveness: number };
      active?: boolean;
      id?: string;
    }) => {
      const saved = await saveCustomMode({ ...draft, active: draft.active ?? true });
      setCustomModes(await listCustomModes());
      setActiveModeIdState(saved.id);
      setActiveModeId(saved.id);
    },
    []
  );

  const handleDeleteCustomMode = useCallback(
    async (id: string) => {
      await deleteCustomMode(id);
      // Les souvenirs contextuels sont détachés (contenu et identifiants préservés).
      memoryRepository.removeModeReferences(id);
      setMemories(memoryRepository.listMemories());
      setCustomModes(await listCustomModes());
      if (activeModeId === id) {
        setActiveModeIdState("classic");
        setActiveModeId("classic");
      }
    },
    [activeModeId]
  );

  const handleToggleCustomMode = useCallback(async (id: string, active: boolean) => {
    await setCustomModeActive(id, active);
    setCustomModes(await listCustomModes());
  }, []);

  const handleClearAllLocalData = useCallback(async () => {
    stopAllActivity();
    conversationRepository.clearAll();
    const fresh = conversationRepository.createSession();
    setSessions([fresh]);
    setActiveSessionId(fresh.id);
    memoryRepository.clearMemories();
    setMemories([]);

    const errors: string[] = [];
    try {
      await clearProjects();
      setProjects([]);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Échec de suppression des projets.");
    }
    try {
      await clearIntelligenceHistory();
      setIntelligenceHistory([]);
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Échec de suppression de l'historique.");
    }

    await clearStoredFiles();
    setStoredFiles([]);
    await clearSavedSearches();
    setProjectsError(null);
    setHistoryError(null);

    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
  }, [stopAllActivity]);

  const getInputLevel = useCallback(
    () => audioEngineRef.current?.getInputLevel() ?? 0,
    []
  );
  const getOutputLevel = useCallback(
    () => audioEngineRef.current?.getOutputLevel() ?? 0,
    []
  );

  const effectiveVoiceState: VoiceState =
    !isOnline && voiceState === "idle" ? "offline" : voiceState;
  const statusText = VOICE_STATUS_TEXT[effectiveVoiceState];

  const liveInputText = interimTranscript || liveDraftText;
  const liveSentiment: SentimentAnalysis | null = liveInputText.trim()
    ? analyzeUserSentiment(
        liveInputText,
        (activeSession?.messages ?? [])
          .filter((m) => m.role === "user")
          .map((m) => m.text)
      )
    : null;
  const activeToneLabel = TONE_PROSODY_PROFILES[activeTone].label;

  return (
    <NavShell
      activeView={activeView}
      onSelectView={setActiveView}
      voiceState={effectiveVoiceState}
      statusText={statusText}
      isOnline={isOnline}
      geminiModel={geminiModel}
      extremeDark={isExtremeDark}
      onToggleExtremeDark={handleToggleExtremeDark}
      onNewSession={handleNewSession}
      onOpenHistory={() => setIsDrawerOpen(true)}
      sidebarSlot={
        <ChatSidebar
          extremeDark={isExtremeDark}
          activeView={activeView}
          onSelectView={setActiveView}
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={handleSelectSession}
          onNewSession={handleNewSession}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onOpenHistory={() => setIsDrawerOpen(true)}
        />
      }
    >
      {/* Global Banners */}
      {errorInfo && (
        <div className="shrink-0 px-4 pt-3 sm:px-6">
          <div
            className={`max-w-3xl mx-auto rounded-xl border px-4 py-3 flex items-start gap-3 ${
              isExtremeDark
                ? "bg-red-950/20 border-red-500/20"
                : "bg-red-950/40 border-red-400/30 backdrop-blur-md"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 shrink-0 mt-0.5 ${
                isExtremeDark ? "text-red-400/80" : "text-red-300"
              }`}
            />
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium ${
                  isExtremeDark ? "text-red-200/90" : "text-red-100"
                }`}
              >
                {errorInfo.title}
              </p>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isExtremeDark ? "text-red-200/65" : "text-red-200/80"
                }`}
              >
                {errorInfo.detail}
              </p>
              {errorInfo.isMicError && (
                <button
                  type="button"
                  onClick={handleToggleMic}
                  className="mt-2 text-xs font-medium text-cyan-300 hover:text-cyan-200 py-1 cursor-pointer"
                >
                  Réessayer le microphone
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setErrorInfo(null)}
              aria-label="Fermer l'alerte"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-red-200/70 hover:text-red-100 hover:bg-white/[0.05] shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {memoryToast && (
        <div className="shrink-0 px-4 pt-2.5 sm:px-6">
          <div
            className={`max-w-md mx-auto rounded-xl border px-3.5 py-2 flex items-center gap-2 text-xs ${
              isExtremeDark
                ? "bg-cyan-950/20 border-cyan-500/15 text-cyan-300/80"
                : "jarvis-glass border-cyan-400/25 text-cyan-200"
            }`}
          >
            <Check className="w-4 h-4 text-cyan-300 shrink-0" />
            <span className="truncate">Mémorisé : {memoryToast}</span>
          </div>
        </div>
      )}

      {siriListenPending && (
        <div className="shrink-0 px-4 pt-2.5 sm:px-6">
          <div
            className={`max-w-md mx-auto rounded-xl border px-4 py-2.5 flex items-center justify-between gap-3 ${
              isExtremeDark
                ? "bg-cyan-950/25 border-cyan-500/25"
                : "jarvis-glass border-cyan-400/35"
            }`}
          >
            <span
              className={`text-xs ${
                isExtremeDark ? "text-cyan-200/85" : "text-cyan-100"
              }`}
            >
              Raccourci Siri prêt — touchez pour activer le micro.
            </span>
            <button
              type="button"
              onClick={handleToggleMic}
              className={`inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                isExtremeDark
                  ? "bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-200 border border-cyan-500/35"
                  : "bg-cyan-400 hover:bg-cyan-300 text-slate-950"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Écouter</span>
            </button>
          </div>
        </div>
      )}

      {/* Mode Selector (Module 3) */}
      <div className="shrink-0 px-3 sm:px-6 pt-2">
        <div className="max-w-4xl mx-auto">
          <ModeSelector
            extremeDark={isExtremeDark}
            activeModeId={activeModeId}
            customModes={customModes}
            onSelectMode={handleSelectMode}
            onSaveCustomMode={handleSaveCustomMode}
            onDeleteCustomMode={handleDeleteCustomMode}
            onToggleCustomMode={handleToggleCustomMode}
          />
        </div>
      </div>

      {/* Active View Router */}
      {activeView === "home" && (
        <HomeView
          extremeDark={isExtremeDark}
          isOnline={isOnline}
          geminiModel={geminiModel}
          sessions={sessions}
          projects={projects}
          onSelectView={setActiveView}
          onNewSession={handleNewSession}
          onSuggestion={(text) => {
            setComposerDraft(text);
            setActiveView("conversations");
          }}
          onSpeakText={speakPlainText}
          voiceState={effectiveVoiceState}
          getInputLevel={getInputLevel}
          getOutputLevel={getOutputLevel}
          onOrbClick={handleOrbClick}
        />
      )}

      {activeView === "conversations" && (
        <>
          <main className="flex-1 min-h-0 max-w-4xl w-full mx-auto flex flex-col items-center px-3 sm:px-6 py-2 sm:py-3 gap-2.5 sm:gap-3">
            {/* En-tête conversation compact : orb animé conservé, plus d'espace pour le chat */}
            <section
              className={`jarvis-stark-panel shrink-0 w-full rounded-2xl px-3 py-2 flex items-center gap-3 ${
                isExtremeDark ? "text-slate-300" : "text-slate-100"
              }`}
            >
              <JarvisOrb
                voiceState={effectiveVoiceState}
                getInputLevel={getInputLevel}
                getOutputLevel={getOutputLevel}
                onOrbClick={handleOrbClick}
                extremeDark={isExtremeDark}
                compact
              />
              <div className="min-w-0 flex-1 space-y-0.5">
                <p
                  className={`text-[11px] font-mono-tabular font-medium tracking-[0.18em] ${
                    effectiveVoiceState === "offline"
                      ? "text-amber-300"
                      : isExtremeDark
                      ? "text-cyan-400/65"
                      : "text-cyan-300"
                  }`}
                >
                  {statusText}
                  {(effectiveVoiceState === "speaking" ||
                    effectiveVoiceState === "thinking") &&
                  activeTone !== "neutral"
                    ? ` · TON ${activeToneLabel.toUpperCase()}`
                    : ""}
                  {isMuted && effectiveVoiceState !== "speaking" ? " · MUET" : ""}
                </p>
                <p className={`text-xs ${isExtremeDark ? "text-slate-400" : "text-slate-300"}`}>
                  {!isOnline
                    ? "Commandes locales actives (souvenirs, fichiers, heure)"
                    : liveSentiment && liveSentiment.category !== "neutral"
                    ? `${liveSentiment.label} → Ton ${liveSentiment.toneLabel.toLowerCase()}`
                    : effectiveVoiceState === "speaking"
                    ? "Touchez le noyau ou STOP pour interrompre"
                    : effectiveVoiceState === "listening"
                    ? "Parlez naturellement en français"
                    : effectiveVoiceState === "thinking"
                    ? "Analyse Gemini en cours…"
                    : "Touchez le noyau pour parler"}
                </p>
              </div>
            </section>

            {/* Translucent Holographic Conversation Panel */}
            <section
              className={`flex-1 min-h-0 w-full rounded-2xl border flex flex-col overflow-hidden transition-colors ${
                isExtremeDark
                  ? "bg-black border-white/[0.06]"
                  : "jarvis-glass border-cyan-400/20"
              }`}
            >
              <TranscriptStream
                messages={activeSession?.messages ?? []}
                interimTranscript={interimTranscript}
                interimSentiment={interimTranscript ? liveSentiment : null}
                isThinking={isSending}
                extremeDark={isExtremeDark}
                onQuickPrompt={handleSendText}
                onRegenerate={handleRegenerate}
              />
            </section>
          </main>

          <ControlDock
            voiceState={effectiveVoiceState}
            isMuted={isMuted}
            isSending={isSending}
            isOffline={!isOnline}
            extremeDark={isExtremeDark}
            onToggleMic={handleToggleMic}
            onStopAll={stopAllActivity}
            onToggleMute={handleToggleMute}
            onSendText={handleSendText}
            onDraftChange={(text) => {
              setLiveDraftText(text);
              if (!text) setComposerDraft("");
            }}
            initialDraft={composerDraft}
          />
        </>
      )}

      {activeView === "memory" && (
        <MemoryView
          memories={memories}
          extremeDark={isExtremeDark}
          memoryEnabled={intelligenceProfile.memoryEnabled}
          onAddMemory={handleAddMemory}
          onUpdateMemory={handleUpdateMemory}
          onTogglePinMemory={handleTogglePinMemory}
          onToggleDisableMemory={handleToggleDisableMemory}
          onRemoveMemory={handleRemoveMemory}
          onSetMemoryEnabled={handleSetMemoryEnabled}
          onReloadMemories={() => setMemories(memoryRepository.listMemories())}
        />
      )}

      {activeView === "search" && (
        <WebSearchView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "files" && (
        <FilesView
          files={storedFiles}
          onFilesChange={setStoredFiles}
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "video" && (
        <VideoView
          files={storedFiles}
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "aiVideo" && (
        <AiVideoStudioView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {activeView === "intelligence" && (
        <IntelligenceView
          extremeDark={isExtremeDark}
          profile={intelligenceProfile}
          onUpdateProfile={handleUpdateIntelligenceProfile}
          memories={memories}
          memoryEnabled={intelligenceProfile.memoryEnabled}
          onAddMemory={handleAddMemory}
          onUpdateMemory={handleUpdateMemory}
          onTogglePinMemory={handleTogglePinMemory}
          onToggleDisableMemory={handleToggleDisableMemory}
          onRemoveMemory={handleRemoveMemory}
          onSetMemoryEnabled={handleSetMemoryEnabled}
          onReloadMemories={() => setMemories(memoryRepository.listMemories())}
          projects={projects}
          projectsLoading={projectsLoading}
          projectsError={projectsError}
          onReloadProjects={reloadProjects}
          onCreateProject={async (name, objective) => {
            try {
              const p = await createProject(name, objective);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet créé", detail: p.name, level: "success", relatedProjectId: p.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
              return p;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Échec de création du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onSaveProject={async (project) => {
            try {
              const saved = await saveProject(project);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet mis à jour", detail: saved.name, level: "info", relatedProjectId: saved.id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
              return saved;
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Échec d'enregistrement du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onRemoveProject={async (id) => {
            try {
              await removeProject(id);
              await reloadProjects();
              void addIntelligenceHistory({ type: "project_update", title: "Projet supprimé", level: "warning", relatedProjectId: id }).then((ev) => setIntelligenceHistory((prev) => [ev, ...prev])).catch((e) => console.warn("Événement historique non enregistré:", e));
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Échec de suppression du projet.";
              setProjectsError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          history={intelligenceHistory}
          historyLoading={historyLoading}
          historyError={historyError}
          onReloadHistory={reloadHistory}
          onAddHistory={async (event) => {
            try {
              const ev = await addIntelligenceHistory(event);
              setIntelligenceHistory((prev) => [ev, ...prev]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Échec d'enregistrement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          onClearHistory={async () => {
            try {
              await clearIntelligenceHistory();
              setIntelligenceHistory([]);
              setHistoryError(null);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Échec d'effacement de l'historique.";
              setHistoryError(msg);
              throw e instanceof Error ? e : new Error(msg);
            }
          }}
          sessions={sessions}
        />
      )}

      {activeView === "settings" && (
        <SettingsView
          extremeDark={isExtremeDark}
          onToggleExtremeDark={handleToggleExtremeDark}
          isOnline={isOnline}
          geminiModel={geminiModel}
          sessions={sessions}
          memories={memories}
          files={storedFiles}
          onClearAllLocalData={handleClearAllLocalData}
          vocalStyle={vocalStyle}
          onChangeVocalStyle={setVocalStyle}
        />
      )}

      {activeView === "news" && (
        <NewsView
          isOnline={isOnline}
          extremeDark={isExtremeDark}
          onSpeakText={speakPlainText}
        />
      )}

      {activeView === "social" && (
        <SocialHubView isOnline={isOnline} extremeDark={isExtremeDark} />
      )}

      {/* Session Switcher & Quick Archives Drawer */}
      <HistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        sessions={sessions}
        activeSessionId={activeSession?.id ?? ""}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        memories={memories}
        onAddMemory={(fact) => handleAddMemory(fact, "autre")}
        onRemoveMemory={handleRemoveMemory}
        extremeDark={isExtremeDark}
        onToggleExtremeDark={handleToggleExtremeDark}
      />
    </NavShell>
  );
}
