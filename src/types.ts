export interface LoreEntry {
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

export interface CharacterData {
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
  character_book?: { name?: string; description?: string; entries: LoreEntry[] } | null;
}

export interface CharacterCard {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: CharacterData;
}

export type EditableField = keyof Pick<CharacterData,
  "name" | "description" | "personality" | "scenario" | "first_mes" | "mes_example" |
  "creator_notes" | "system_prompt" | "post_history_instructions">;

export interface AiResult {
  fields?: Partial<Record<EditableField, string>>;
  suggestions?: string[];
  explanation?: string;
  score?: ScoreResult;
  lorebook?: { entries: Record<string, LoreEntry> };
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
