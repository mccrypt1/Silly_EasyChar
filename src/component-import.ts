import { normalizeLoreEntry } from "./card";
import type { CharacterCard, CoreEditableField } from "./types";

export type ImportPart = CoreEditableField | "alternate_greetings" | "tags" | "creator" | "character_version" | "talkativeness" | "character_book";

export const importPartLabels: [ImportPart, string][] = [
  ["name", "Name"],
  ["description", "Beschreibung"],
  ["personality", "Persönlichkeit"],
  ["scenario", "Szenario"],
  ["first_mes", "Erste Nachricht"],
  ["mes_example", "Dialogbeispiele"],
  ["creator_notes", "Creator Notes"],
  ["system_prompt", "System Prompt"],
  ["post_history_instructions", "Post-History Instructions"],
  ["alternate_greetings", "Alternative Begrüßungen hinzufügen"],
  ["tags", "Tags ergänzen"],
  ["creator", "Creator"],
  ["character_version", "Kartenversion"],
  ["talkativeness", "Talkativeness"],
  ["character_book", "Lorebook-Einträge hinzufügen"]
];

const textParts = new Set<ImportPart>(["name","description","personality","scenario","first_mes","mes_example","creator_notes","system_prompt","post_history_instructions"]);

export function importCardParts(target: CharacterCard, source: CharacterCard, parts: ImportPart[]): CharacterCard {
  const output = structuredClone(target);
  for (const part of parts) {
    if (textParts.has(part)) output.data[part as CoreEditableField] = source.data[part as CoreEditableField];
    else if (part === "alternate_greetings") output.data.alternate_greetings.push(...source.data.alternate_greetings);
    else if (part === "tags") output.data.tags = [...new Set([...output.data.tags, ...source.data.tags])];
    else if (part === "creator") output.data.creator = source.data.creator;
    else if (part === "character_version") output.data.character_version = source.data.character_version;
    else if (part === "talkativeness") output.data.extensions.talkativeness = source.data.extensions.talkativeness ?? "0.5";
    else if (part === "character_book" && source.data.character_book?.entries.length) {
      const existing = output.data.character_book?.entries ?? [];
      const added = source.data.character_book.entries.map((entry, index) => normalizeLoreEntry(entry, existing.length + index));
      output.data.character_book = {
        name: output.data.character_book?.name || source.data.character_book.name || output.data.name + " Lorebook",
        description: output.data.character_book?.description || source.data.character_book.description,
        entries: [...existing, ...added].map((entry, index) => ({ ...entry, uid: index }))
      };
    }
  }
  return output;
}
