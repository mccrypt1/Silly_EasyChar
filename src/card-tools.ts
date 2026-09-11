import type { CardDiff, CharacterCard, UndoEntry } from "./types";

export type PromptUse = "Dauerhaft" | "Nur beim Start" | "Bedingt";

const labels: Record<string, string> = {
  name: "Name", description: "Beschreibung", personality: "Persönlichkeit", scenario: "Szenario",
  first_mes: "Erste Nachricht", mes_example: "Dialogbeispiele", creator_notes: "Creator Notes",
  system_prompt: "System Prompt", post_history_instructions: "Post-History Instructions",
  tags: "Tags", creator: "Creator", character_version: "Version", extensions: "Erweiterungen",
  character_book: "Lorebook", group_only_greetings: "Gruppenbegrüßungen"
};

export function estimateTokens(text: string): number {
  const value = text.trim();
  return value ? Math.max(1, Math.ceil(value.length / 4)) : 0;
}

export function promptUseFor(path: string): PromptUse {
  if (path.includes("first_mes") || path.includes("alternate_greetings")) return "Nur beim Start";
  if (path.includes("mes_example") || path.includes("/dialogue/") || path.includes("character_book") || path.includes("group_only")) return "Bedingt";
  return "Dauerhaft";
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function add(output: CardDiff[], path: string, label: string, before: unknown, after: unknown, kind: CardDiff["kind"] = "text") {
  if (stable(before) !== stable(after)) output.push({ path, label, before, after, kind });
}

export function diffCards(current: CharacterCard, snapshot: CharacterCard, portraitChanged = false): CardDiff[] {
  const output: CardDiff[] = [];
  const scalar = ["name", "description", "personality", "scenario", "first_mes", "creator_notes", "system_prompt", "post_history_instructions", "creator", "character_version"];
  for (const key of scalar) add(output, `/data/${key}`, labels[key], snapshot.data[key], current.data[key]);
  const maxGreetings = Math.max(snapshot.data.alternate_greetings.length, current.data.alternate_greetings.length);
  for (let index = 0; index < maxGreetings; index++) add(output, `/data/alternate_greetings/${index}`, `Alternative Begrüßung ${index + 1}`, snapshot.data.alternate_greetings[index] ?? "", current.data.alternate_greetings[index] ?? "");
  const beforeExamples = splitExamples(String(snapshot.data.mes_example ?? ""));
  const afterExamples = splitExamples(String(current.data.mes_example ?? ""));
  for (let index = 0; index < Math.max(beforeExamples.length, afterExamples.length); index++) add(output, `/dialogue/${index}`, `Dialogbeispiel ${index + 1}`, beforeExamples[index] ?? "", afterExamples[index] ?? "");
  for (const key of ["tags", "extensions", "group_only_greetings", "character_book", "assets", "nickname", "creator_notes_multilingual", "source", "creation_date"]) add(output, `/data/${key}`, labels[key] ?? key, snapshot.data[key], current.data[key], "json");
  const knownRoot = new Set(["spec", "spec_version", "data"]);
  const knownData = new Set(["name", "description", "personality", "scenario", "first_mes", "mes_example", "creator_notes", "system_prompt", "post_history_instructions", "alternate_greetings", "tags", "creator", "character_version", "extensions", "character_book", "assets", "nickname", "creator_notes_multilingual", "source", "group_only_greetings", "creation_date", "modification_date"]);
  const dataBefore = Object.fromEntries(Object.entries(snapshot.data).filter(([key]) => !knownData.has(key)));
  const dataAfter = Object.fromEntries(Object.entries(current.data).filter(([key]) => !knownData.has(key)));
  add(output, "/unknown-data", "Weitere V3-Datenfelder", dataBefore, dataAfter, "json");
  const rootBefore = Object.fromEntries(Object.entries(snapshot).filter(([key]) => !knownRoot.has(key)));
  const rootAfter = Object.fromEntries(Object.entries(current).filter(([key]) => !knownRoot.has(key)));
  add(output, "/unknown-root", "Weitere V3-Daten", rootBefore, rootAfter, "json");
  if (portraitChanged) output.push({ path: "/portrait", label: "Portrait", before: "Version", after: "Aktuell", kind: "portrait" });
  return output;
}

function splitExamples(text: string): string[] {
  const blocks = text.split(/(?=<START>)/giu).map(value => value.trim()).filter(Boolean);
  return blocks.length ? blocks : (text.trim() ? [text.trim()] : []);
}

function setPath(target: any, path: string, value: unknown) {
  const parts = path.split("/").filter(Boolean);
  let cursor = target;
  for (let index = 0; index < parts.length - 1; index++) {
    const key = /^\d+$/.test(parts[index]) ? Number(parts[index]) : parts[index];
    cursor = cursor[key] ??= /^\d+$/.test(parts[index + 1]) ? [] : {};
  }
  const last = /^\d+$/.test(parts.at(-1)!) ? Number(parts.at(-1)!) : parts.at(-1)!;
  if (value === undefined) Array.isArray(cursor) ? cursor.splice(Number(last), 1) : delete cursor[last];
  else cursor[last] = structuredClone(value);
}

export function restoreCardParts(current: CharacterCard, snapshot: CharacterCard, paths: string[]): CharacterCard {
  const result = structuredClone(current);
  const dialogue = splitExamples(String(result.data.mes_example ?? ""));
  const snapshotDialogue = splitExamples(String(snapshot.data.mes_example ?? ""));
  for (const path of paths) {
    if (path.startsWith("/dialogue/")) {
      const index = Number(path.split("/").at(-1));
      if (snapshotDialogue[index] == null) dialogue.splice(index, 1); else dialogue[index] = snapshotDialogue[index];
    } else if (path === "/unknown-root") {
      for (const key of Object.keys(result)) if (!["spec", "spec_version", "data"].includes(key)) delete result[key];
      for (const [key, value] of Object.entries(snapshot)) if (!["spec", "spec_version", "data"].includes(key)) result[key] = structuredClone(value);
    } else if (path === "/unknown-data") {
      const knownData = new Set(["name", "description", "personality", "scenario", "first_mes", "mes_example", "creator_notes", "system_prompt", "post_history_instructions", "alternate_greetings", "tags", "creator", "character_version", "extensions", "character_book", "assets", "nickname", "creator_notes_multilingual", "source", "group_only_greetings", "creation_date", "modification_date"]);
      for (const key of Object.keys(result.data)) if (!knownData.has(key)) delete result.data[key];
      for (const [key, value] of Object.entries(snapshot.data)) if (!knownData.has(key)) result.data[key] = structuredClone(value);
    } else if (path !== "/portrait") {
      const parts = path.split("/").filter(Boolean);
      let source: any = snapshot;
      for (const part of parts) source = source?.[/^\d+$/.test(part) ? Number(part) : part];
      setPath(result, path, source);
    }
  }
  if (paths.some(path => path.startsWith("/dialogue/"))) result.data.mes_example = dialogue.filter(Boolean).join("\n\n");
  return result;
}

export class UndoHistory {
  private undoStack: UndoEntry[] = [];
  private redoStack: UndoEntry[] = [];
  constructor(private readonly limit = 100) {}
  push(entry: UndoEntry) {
    this.undoStack.push(cloneEntry(entry));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current: UndoEntry): UndoEntry | null {
    const previous = this.undoStack.pop();
    if (!previous) return null;
    this.redoStack.push(cloneEntry(current));
    return cloneEntry(previous);
  }
  redo(current: UndoEntry): UndoEntry | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(cloneEntry(current));
    return cloneEntry(next);
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
  clear() { this.undoStack = []; this.redoStack = []; }
}

function cloneEntry(entry: UndoEntry): UndoEntry {
  return { card: structuredClone(entry.card), image: entry.image?.slice(0) ?? null, label: entry.label };
}
