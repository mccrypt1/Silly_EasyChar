import type { CharacterCard, CharacterData, LoreEntry, ScoreResult } from "./types";

export const emptyData = (): CharacterData => ({
  name: "Neue Figur",
  description: "",
  personality: "",
  scenario: "",
  first_mes: "",
  mes_example: "",
  creator_notes: "",
  system_prompt: "",
  post_history_instructions: "",
  alternate_greetings: [],
  tags: [],
  creator: "",
  character_version: "1.0",
  extensions: {},
  character_book: null
});

export const emptyCard = (): CharacterCard => ({ spec: "chara_card_v2", spec_version: "2.0", data: emptyData() });

export function normalizeCard(input: any): CharacterCard {
  const source = input?.data && typeof input.data === "object" ? input.data : input ?? {};
  const defaults = emptyData();
  const data: CharacterData = {
    ...defaults,
    ...source,
    name: String(source.name ?? source.char_name ?? defaults.name),
    description: String(source.description ?? source.char_persona ?? ""),
    scenario: String(source.scenario ?? source.world_scenario ?? ""),
    first_mes: String(source.first_mes ?? source.char_greeting ?? ""),
    mes_example: String(source.mes_example ?? source.example_dialogue ?? ""),
    alternate_greetings: Array.isArray(source.alternate_greetings) ? source.alternate_greetings.map(String) : [],
    tags: Array.isArray(source.tags) ? source.tags.map(String) : [],
    extensions: source.extensions && typeof source.extensions === "object" ? source.extensions : {},
    character_book: normalizeBook(source.character_book)
  };
  return { spec: "chara_card_v2", spec_version: "2.0", data };
}

function normalizeBook(book: any): CharacterData["character_book"] {
  if (!book) return null;
  const raw: any[] = Array.isArray(book.entries) ? book.entries : Object.values(book.entries ?? {});
  return { name: String(book.name ?? "Lorebook"), description: String(book.description ?? ""), entries: raw.map((e: any, i: number) => normalizeLoreEntry(e, i)) };
}

export function normalizeLoreEntry(e: any, uid: number): LoreEntry {
  return {
    uid, key: Array.isArray(e?.key) ? e.key.map(String) : [], keysecondary: Array.isArray(e?.keysecondary) ? e.keysecondary.map(String) : [],
    comment: String(e?.comment ?? `Eintrag ${uid + 1}`), content: String(e?.content ?? ""), constant: !!e?.constant,
    selective: Array.isArray(e?.keysecondary) && e.keysecondary.length > 0 ? !!e?.selective : false,
    selectiveLogic: Number(e?.selectiveLogic ?? 0), addMemo: e?.addMemo !== false, order: Number(e?.order ?? 100),
    position: Number(e?.position ?? 0), disable: !!e?.disable, probability: Number(e?.probability ?? 100),
    useProbability: e?.useProbability !== false, depth: Number(e?.depth ?? 4), delay: Number(e?.delay ?? 0),
    cooldown: Number(e?.cooldown ?? 0), sticky: Number(e?.sticky ?? 0), vectorized: false,
    ignoreBudget: !!e?.ignoreBudget, excludeRecursion: false, preventRecursion: !!e?.preventRecursion
  };
}

export function localScore(card: CharacterCard): ScoreResult {
  const d = card.data;
  const filled = [d.name, d.description, d.personality, d.scenario, d.first_mes, d.mes_example].filter(v => v.trim()).length;
  const structure = Math.round((filled / 6) * 20);
  const identity = Math.min(20, 5 + Math.round((d.description.length + d.personality.length) / 220));
  const examples = (d.mes_example.match(/<START>/gi) ?? []).length + (d.mes_example.match(/{{user}}/gi) ?? []).length;
  const roleplay = Math.min(20, (d.first_mes.length > 120 ? 9 : d.first_mes.length > 30 ? 5 : 1) + Math.min(11, examples * 2));
  const texture = ["speech", "manner", "goal", "fear", "quirk", "likes", "dislikes", "background"].filter(x => d.description.toLowerCase().includes(x)).length;
  const creativity = Math.min(20, 7 + texture + Math.min(5, d.alternate_greetings.length * 2));
  const polish = Math.min(20, 5 + (d.tags.length >= 3 ? 3 : 0) + (d.creator ? 2 : 0) + (d.character_version ? 2 : 0) + (d.first_mes.includes("{{user}}") ? 3 : 0) + (d.description.length > 350 ? 5 : 0));
  const findings: string[] = [];
  if (!d.personality.trim()) findings.push("Persönlichkeit ist leer oder in der Beschreibung versteckt.");
  if (!d.mes_example.trim()) findings.push("Dialogbeispiele fehlen; 3–5 abwechslungsreiche Wechsel helfen stark.");
  if (d.first_mes.length < 100) findings.push("Die erste Nachricht könnte Ort, Handlung und Gesprächsanlass klarer setzen.");
  if (d.description.length > 3500) findings.push("Die Beschreibung ist sehr lang; Informationen sollten auf passende Felder/Lorebook verteilt werden.");
  if (!d.scenario.trim()) findings.push("Das Szenario fehlt.");
  return { total: structure + identity + roleplay + creativity + polish, structure, coherence: identity, roleplay, creativity, polish, findings };
}
