export interface LoreEntry {
  [key: string]: unknown;
  uid: number;
  key: string[];
  keysecondary: string[];
  comment: string;
  content: string;
  constant: boolean;
  selective: boolean;
  selectiveLogic: number;
  addMemo: boolean;
  order: number;
  position: number;
  disable: boolean;
  probability: number;
  useProbability: boolean;
  depth: number;
  delay: number;
  cooldown: number;
  sticky: number;
  vectorized: boolean;
  ignoreBudget: boolean;
  excludeRecursion: boolean;
  preventRecursion: boolean;
}

export interface CharacterAsset {
  type: string;
  uri: string;
  name: string;
  ext: string;
}

export interface CharacterData {
  [key: string]: unknown;
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown>;
  character_book?: { [key: string]: unknown; name?: string; description?: string; extensions?: Record<string, unknown>; entries: LoreEntry[] } | null;
  assets?: CharacterAsset[];
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  group_only_greetings: string[];
  creation_date?: number;
  modification_date?: number;
}

export interface CharacterCard {
  [key: string]: unknown;
  spec: "chara_card_v2" | "chara_card_v3";
  spec_version: "2.0" | "3.0";
  data: CharacterData;
}

export type CoreEditableField = keyof Pick<CharacterData,
  "name" | "description" | "personality" | "scenario" | "first_mes" | "mes_example" |
  "creator_notes" | "system_prompt" | "post_history_instructions">;

export type EditableField = CoreEditableField | `alternate_greeting:${number}` | `mes_example:${number}`;

export interface AiResult {
  fields?: Partial<Record<EditableField, string>>;
  suggestions?: string[];
  explanation?: string;
  score?: ScoreResult;
  lorebook?: { entries: Record<string, LoreEntry> };
}

export interface CardDiff {
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  kind: "text" | "json" | "portrait";
}

export interface UndoEntry {
  card: CharacterCard;
  image: ArrayBuffer | null;
  label: string;
}

export interface ScoreResult {
  total: number;
  structure: number;
  coherence: number;
  roleplay: number;
  creativity: number;
  polish: number;
  findings: string[];
}
