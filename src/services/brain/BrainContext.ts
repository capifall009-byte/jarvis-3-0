import type {
  IntelligenceProfile,
  JarvisMode,
  MemoryItem,
  ProjectItem,
  TranscriptMessage,
} from "../../types/jarvis";
import { composeModeInstructions } from "../modes/ModeRepository";
import { memoryRepository } from "../memory/MemoryRepository";

export interface BrainProjectContext {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  progress?: number;
  nextActions?: string[];
  blockers?: string[];
}

export interface BrainModeContext {
  id: string;
  name: string;
  instructions?: string;
}

export interface BrainConversationContextInput {
  sessionId: string | null;
  history: TranscriptMessage[];
}

export interface BrainUnifiedContextInput {
  message: string;
  history: TranscriptMessage[];
  activeMode: JarvisMode | null;
  intelligenceProfile: IntelligenceProfile;
  projects: ProjectItem[];
  memories?: MemoryItem[];
  vocalStyle?: {
    emotion: string | null;
    personality: string;
    intensity: number;
    auto: boolean;
    geminiInstruction?: string;
  } | null;
  userTimeZone?: string;
}

export interface BrainUnifiedContext {
  message: string;
  history: TranscriptMessage[];
  memories: MemoryItem[];
  mode?: BrainModeContext;
  intelligenceProfile: Partial<IntelligenceProfile>;
  projects: BrainProjectContext[];
  vocalStyle?: {
    emotion: string | null;
    personality: string;
    intensity: number;
    auto: boolean;
    geminiInstruction?: string;
  };
  userTimeZone?: string;
  meta: {
    memoryEnabled: boolean;
    memoryCount: number;
    projectCount: number;
    activeModeId: string | null;
  };
}

/**
 * Cerveau central (client) : construit un contexte unifié à partir des dépôts/services existants.
 * Ne crée pas de mémoire parallèle ; lit les mémoires/projets/modes/conversations déjà persistés.
 */
export function buildBrainUnifiedContext(input: BrainUnifiedContextInput): BrainUnifiedContext {
  const modeId = input.activeMode?.id;
  const memories = (input.memories ?? memoryRepository.getContextMemories(modeId)).filter((m) => !m.disabled);

  const projects: BrainProjectContext[] = input.projects
    .filter((p) => p.status !== "archived")
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      objective: p.objective,
      status: p.status,
      progress: p.progress,
      nextActions: p.nextActions || [],
      blockers: (p.blockers || []).filter((b) => !b.resolvedAt).map((b) => b.description),
    }));

  const mode = input.activeMode
    ? {
        id: input.activeMode.id,
        name: input.activeMode.name,
        instructions: composeModeInstructions(input.activeMode),
      }
    : undefined;

  const profile = input.intelligenceProfile;

  return {
    message: input.message.trim(),
    history: input.history,
    memories,
    mode,
    intelligenceProfile: {
      baseTone: profile.baseTone,
      humorLevel: profile.humorLevel,
      sarcasmLevel: profile.sarcasmLevel,
      proactivityLevel: profile.proactivityLevel,
      detailPreference: profile.detailPreference,
      askWhenMissingInfo: profile.askWhenMissingInfo,
      memoryEnabled: profile.memoryEnabled,
    },
    projects,
    vocalStyle: input.vocalStyle || undefined,
    userTimeZone:
      input.userTimeZone ||
      (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined),
    meta: {
      memoryEnabled: profile.memoryEnabled,
      memoryCount: memories.length,
      projectCount: projects.length,
      activeModeId: modeId ?? null,
    },
  };
}

export function getBrainMemoryContext(modeId?: string): MemoryItem[] {
  return memoryRepository.getContextMemories(modeId);
}
