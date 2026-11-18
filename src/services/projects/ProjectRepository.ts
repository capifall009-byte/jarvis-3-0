import type { ProjectBlocker, ProjectItem, ProjectStatus, ProjectTask, ProjectTaskStatus } from "../../types/jarvis";
import {
  idbClear,
  idbClearRequired,
  idbDelete,
  idbDeleteRequired,
  idbGetAll,
  idbGetAllRequired,
  idbPut,
  idbPutRequired,
} from "../storage/IndexedDbStore";

const STORE = "projects";

function uid(prefix = "id"): string {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeTask(t: any): ProjectTask {
  const subtasks = Array.isArray(t?.subtasks) ? t.subtasks.map(normalizeTask) : [];
  return {
    id: typeof t?.id === "string" ? t.id : uid("task"),
    title: String(t?.title || "Tâche"),
    description: typeof t?.description === "string" ? t.description : undefined,
    status: (t?.status as ProjectTaskStatus) || "todo",
    subtasks,
    completedAt: typeof t?.completedAt === "number" ? t.completedAt : undefined,
    createdAt: typeof t?.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t?.updatedAt === "number" ? t.updatedAt : Date.now(),
  };
}

function normalizeBlocker(b: any): ProjectBlocker {
  return {
    id: typeof b?.id === "string" ? b.id : uid("blk"),
    description: String(b?.description || ""),
    createdAt: typeof b?.createdAt === "number" ? b.createdAt : Date.now(),
    resolvedAt: typeof b?.resolvedAt === "number" ? b.resolvedAt : undefined,
  };
}

function normalizeProject(p: any): ProjectItem | null {
  if (!p || typeof p !== "object" || typeof p.id !== "string") return null;
  const now = Date.now();
  return {
    id: p.id,
    name: String(p.name || "Projet sans nom"),
    objective: typeof p.objective === "string" ? p.objective : undefined,
    status: (p.status as ProjectStatus) || "active",
    progress: typeof p.progress === "number" ? Math.max(0, Math.min(100, Math.round(p.progress))) : 0,
    tasks: Array.isArray(p.tasks) ? p.tasks.map(normalizeTask) : [],
    blockers: Array.isArray(p.blockers) ? p.blockers.map(normalizeBlocker) : [],
    nextActions: Array.isArray(p.nextActions) ? p.nextActions.map((x: any) => String(x)).filter(Boolean) : [],
    linkedConversationIds: Array.isArray(p.linkedConversationIds) ? p.linkedConversationIds.map(String) : [],
    linkedConversationTitles: Array.isArray(p.linkedConversationTitles) ? p.linkedConversationTitles.map(String) : [],
    notes: typeof p.notes === "string" ? p.notes : undefined,
    createdAt: typeof p.createdAt === "number" ? p.createdAt : now,
    updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : now,
  };
}

function computeProgress(tasks: ProjectTask[]): number {
  const flat: ProjectTask[] = [];
  const walk = (items: ProjectTask[]) => {
    for (const t of items) {
      flat.push(t);
      if (t.subtasks?.length) walk(t.subtasks);
    }
  };
  walk(tasks);
  if (flat.length === 0) return 0;
  const done = flat.filter((t) => t.status === "done").length;
  return Math.round((done / flat.length) * 100);
}

export async function listProjects(): Promise<ProjectItem[]> {
  const items = (await idbGetAllRequired<ProjectItem>(STORE))
    .map(normalizeProject)
    .filter((p): p is ProjectItem => p !== null);
  return items.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveProject(project: ProjectItem): Promise<ProjectItem> {
  const next: ProjectItem = {
    ...project,
    progress: computeProgress(project.tasks),
    updatedAt: Date.now(),
  };
  await idbPutRequired(STORE, next);
  return next;
}

export async function createProject(name: string, objective?: string): Promise<ProjectItem> {
  const now = Date.now();
  const project: ProjectItem = {
    id: uid("proj"),
    name: name.trim() || "Nouveau projet",
    objective: objective?.trim() || undefined,
    status: "active",
    progress: 0,
    tasks: [],
    blockers: [],
    nextActions: [],
    linkedConversationIds: [],
    linkedConversationTitles: [],
    createdAt: now,
    updatedAt: now,
  };
  await idbPutRequired(STORE, project);
  return project;
}

export async function removeProject(id: string): Promise<void> {
  await idbDeleteRequired(STORE, id);
}

export async function clearProjects(): Promise<void> {
  await idbClearRequired(STORE);
}

export function addTask(project: ProjectItem, title: string, parentTaskId?: string): ProjectItem {
  const now = Date.now();
  const task: ProjectTask = {
    id: uid("task"),
    title: title.trim() || "Nouvelle tâche",
    status: "todo",
    subtasks: [],
    createdAt: now,
    updatedAt: now,
  };
  const insert = (tasks: ProjectTask[]): ProjectTask[] =>
    tasks.map((t) => {
      if (t.id === parentTaskId) return { ...t, subtasks: [...t.subtasks, task], updatedAt: now };
      return { ...t, subtasks: insert(t.subtasks) };
    });
  return {
    ...project,
    tasks: parentTaskId ? insert(project.tasks) : [...project.tasks, task],
    updatedAt: now,
  };
}

export function setTaskStatus(project: ProjectItem, taskId: string, status: ProjectTaskStatus): ProjectItem {
  const now = Date.now();
  const update = (tasks: ProjectTask[]): ProjectTask[] =>
    tasks.map((t) => {
      if (t.id === taskId) {
        return {
          ...t,
          status,
          completedAt: status === "done" ? now : undefined,
          updatedAt: now,
        };
      }
      return { ...t, subtasks: update(t.subtasks) };
    });
  return { ...project, tasks: update(project.tasks), updatedAt: now };
}

export function removeTask(project: ProjectItem, taskId: string): ProjectItem {
  const del = (tasks: ProjectTask[]): ProjectTask[] =>
    tasks.filter((t) => t.id !== taskId).map((t) => ({ ...t, subtasks: del(t.subtasks) }));
  return { ...project, tasks: del(project.tasks), updatedAt: Date.now() };
}

export function addBlocker(project: ProjectItem, description: string): ProjectItem {
  const now = Date.now();
  return {
    ...project,
    blockers: [...project.blockers, { id: uid("blk"), description: description.trim(), createdAt: now }],
    updatedAt: now,
  };
}

export function resolveBlocker(project: ProjectItem, blockerId: string): ProjectItem {
  const now = Date.now();
  return {
    ...project,
    blockers: project.blockers.map((b) => (b.id === blockerId ? { ...b, resolvedAt: now } : b)),
    updatedAt: now,
  };
}

export function linkConversation(project: ProjectItem, conversationId: string, title?: string): ProjectItem {
  if (project.linkedConversationIds.includes(conversationId)) return project;
  return {
    ...project,
    linkedConversationIds: [...project.linkedConversationIds, conversationId],
    linkedConversationTitles: title ? [...project.linkedConversationTitles, title] : project.linkedConversationTitles,
    updatedAt: Date.now(),
  };
}

export function exportProjectsJson(projects: ProjectItem[]): string {
  return JSON.stringify({ exportedAt: new Date().toISOString(), version: "3.0-module6", projects }, null, 2);
}

export async function importProjectsJson(json: string): Promise<{ imported: number; error?: string }> {
  try {
    const parsed = JSON.parse(json) as any;
    const items = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.projects) ? parsed.projects : null;
    if (!items) return { imported: 0, error: "Format invalide: projets introuvables." };
    let imported = 0;
    for (const raw of items) {
      const norm = normalizeProject(raw);
      if (!norm) continue;
      const item = { ...norm, id: uid("proj"), updatedAt: Date.now() };
      await idbPutRequired(STORE, item);
      imported += 1;
    }
    return { imported };
  } catch (e) {
    return { imported: 0, error: e instanceof Error ? e.message : "Échec import." };
  }
}
