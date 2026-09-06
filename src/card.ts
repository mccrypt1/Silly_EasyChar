import type { CharacterCard, CharacterData, CoreEditableField, LoreEntry, ScoreResult } from "./types";

export const CREATOR_NOTE_STAMP = "Crafted / Reforged / Translated with mccrypt1´s Silly EasyChar Studio";

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
  group_only_greetings: [],
  assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }],
  creation_date: Math.floor(Date.now() / 1000),
  modification_date: Math.floor(Date.now() / 1000),
  tags: [],
  creator: "",
  character_version: "1.0",
  extensions: {},
  character_book: null
});

export const emptyCard = (): CharacterCard => ({ spec: "chara_card_v3", spec_version: "3.0", data: emptyData() });

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
    group_only_greetings: Array.isArray(source.group_only_greetings) ? source.group_only_greetings.map(String) : [],
    assets: Array.isArray(source.assets) ? source.assets : defaults.assets,
    creation_date: Number.isFinite(source.creation_date) ? Number(source.creation_date) : defaults.creation_date,
    modification_date: Number.isFinite(source.modification_date) ? Number(source.modification_date) : defaults.modification_date,
    character_book: normalizeBook(source.character_book)
  };
  return normalizeCardPlaceholders({ spec: "chara_card_v3", spec_version: "3.0", data });
}

const placeholderFields: CoreEditableField[] = [
  "description",
  "personality",
  "scenario",
  "first_mes",
  "mes_example",
  "creator_notes",
  "system_prompt",
  "post_history_instructions"
];

export function normalizePlaceholders(text: string): string {
  const normalized = text
    .replace(/\{\{\s*user\s*\}\}/giu, "{{user}}")
    .replace(/\{\{\s*char\s*\}\}/giu, "{{char}}")
    .replace(/(^|[^\p{L}\p{N}_{])user(?=$|[^\p{L}\p{N}_}])/giu, "$1{{user}}")
    .replace(/(^|[^\p{L}\p{N}_{])char(?=$|[^\p{L}\p{N}_}])/giu, "$1{{char}}");
  const contractions: Record<string, string> = {
    zum: "zu", zur: "zu", vom: "von", beim: "bei", im: "in",
    am: "an", ins: "in", ans: "an", aufs: "auf"
  };
  const withoutContractions = normalized.replace(
    /\b(zum|zur|vom|beim|im|am|ins|ans|aufs)\s+(?=\{\{(?:user|char)\}\})/giu,
    (_match, word: string) => {
      const replacement = contractions[word.toLocaleLowerCase("de-DE")] ?? word;
      return (word[0] === word[0].toLocaleUpperCase("de-DE")
        ? replacement[0].toLocaleUpperCase("de-DE") + replacement.slice(1)
        : replacement) + " ";
    }
  );
  return withoutContractions.replace(
    /\b(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines)\s+(?=\{\{(?:user|char)\}\})/giu, ""
  );
}

export function normalizeCardPlaceholders(card: CharacterCard): CharacterCard {
  for (const field of placeholderFields) {
    card.data[field] = normalizePlaceholders(card.data[field]);
  }
  card.data.alternate_greetings = card.data.alternate_greetings.map(normalizePlaceholders);
  card.data.group_only_greetings = card.data.group_only_greetings.map(normalizePlaceholders);
  for (const entry of card.data.character_book?.entries ?? []) {
    entry.content = normalizePlaceholders(entry.content);
  }
  return card;
}

export function prepareCardForExport(card: CharacterCard): CharacterCard {
  const output = normalizeCardPlaceholders(structuredClone(card));
  const creatorNotes = output.data.creator_notes.split(CREATOR_NOTE_STAMP).join("").trim();
  output.data.creator_notes = creatorNotes ? `${creatorNotes}\n\n${CREATOR_NOTE_STAMP}` : CREATOR_NOTE_STAMP;
  output.spec = "chara_card_v3";
  output.spec_version = "3.0";
  output.data.group_only_greetings ??= [];
  output.data.assets ??= [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }];
  output.data.creation_date ??= Math.floor(Date.now() / 1000);
  output.data.modification_date = Math.floor(Date.now() / 1000);
  return output;
}

export function toV3Card(card: CharacterCard): CharacterCard {
  const output = structuredClone(card) as any;
  output.spec = "chara_card_v3";
  output.spec_version = "3.0";
  if (output.data.character_book) {
    const source = output.data.character_book;
    output.data.character_book = {
      name: source.name,
      description: source.description,
      extensions: source.extensions ?? {},
      entries: (source.entries ?? []).map((entry: any) => ({
        keys: entry.key ?? entry.keys ?? [],
        content: entry.content ?? "",
        extensions: entry.extensions ?? {},
        enabled: entry.disable === undefined ? entry.enabled !== false : !entry.disable,
        insertion_order: Number(entry.order ?? entry.insertion_order ?? 100),
        use_regex: !!entry.use_regex,
        constant: !!entry.constant,
        name: entry.name ?? entry.comment,
        id: entry.id ?? entry.uid,
        comment: entry.comment,
        selective: !!entry.selective,
        secondary_keys: entry.keysecondary ?? entry.secondary_keys ?? []
      }))
    };
  }
  return output;
}

function normalizeBook(book: any): CharacterData["character_book"] {
  if (!book) return null;
  const raw: any[] = Array.isArray(book.entries) ? book.entries : Object.values(book.entries ?? {});
  return { name: String(book.name ?? "Lorebook"), description: String(book.description ?? ""), entries: raw.map((e: any, i: number) => normalizeLoreEntry(e, i)) };
}

export function normalizeLoreEntry(e: any, uid: number): LoreEntry {
  const primaryKeys = Array.isArray(e?.key) ? e.key : Array.isArray(e?.keys) ? e.keys : [];
  const secondaryKeys = Array.isArray(e?.keysecondary) ? e.keysecondary : Array.isArray(e?.secondary_keys) ? e.secondary_keys : [];
  return {
    uid: Number(e?.uid ?? e?.id ?? uid), key: primaryKeys.map(String), keysecondary: secondaryKeys.map(String),
    comment: String(e?.comment ?? e?.name ?? `Eintrag ${uid + 1}`), content: String(e?.content ?? ""), constant: !!e?.constant,
    selective: secondaryKeys.length > 0 ? !!e?.selective : false,
    selectiveLogic: Number(e?.selectiveLogic ?? 0), addMemo: e?.addMemo !== false, order: Number(e?.order ?? e?.insertion_order ?? 100),
    position: Number(e?.position ?? 0), disable: e?.disable === undefined ? e?.enabled === false : !!e.disable, probability: Number(e?.probability ?? 100),
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
