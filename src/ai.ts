import type { AiResult, CharacterCard, CoreEditableField, EditableField } from "./types";
import { normalizePlaceholders } from "./card";
import { splitDialogueExamples } from "./dialogue-examples";

declare global { interface Window { __TAURI__?: { core: { invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> } } } }

const fieldLabels: Record<CoreEditableField, string> = {
  name: "Character Name", description: "Description / physical identity and background", personality: "Personality",
  scenario: "Scenario", first_mes: "First Message", mes_example: "Message Examples", creator_notes: "Creator Notes",
  system_prompt: "System Prompt", post_history_instructions: "Post-History Instructions"
};

function fieldLabel(field: EditableField): string {
  if (field.startsWith("alternate_greeting:")) {
    return `Alternate Greeting ${Number(field.split(":")[1]) + 1}`;
  }
  if (field.startsWith("mes_example:")) {
    return `Message Example ${Number(field.split(":")[1]) + 1}`;
  }
  return fieldLabels[field as CoreEditableField];
}

export async function models(url: string): Promise<string[]> {
  return window.__TAURI__!.core.invoke("ollama_models", { baseUrl: url });
}

export function extractJson(text: string): AiResult {
  const clean = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { return JSON.parse(clean); } catch { const start = clean.indexOf("{"); const end = clean.lastIndexOf("}"); if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)); throw new Error("Das Modell hat kein gültiges JSON geliefert."); }
}

function normalizeResult(result: AiResult): AiResult {
  if (!result || typeof result !== "object") return {};
  const normalized = result as AiResult;
  if (normalized.fields && typeof normalized.fields === "object" && !Array.isArray(normalized.fields)) {
    const fields: NonNullable<AiResult["fields"]> = {};
    for (const [field, value] of Object.entries(normalized.fields)) {
      if (typeof value === "string") fields[field as EditableField] = normalizePlaceholders(value);
    }
    normalized.fields = fields;
  } else {
    delete normalized.fields;
  }
  normalized.suggestions = Array.isArray(normalized.suggestions) ? normalized.suggestions.filter(value => typeof value === "string").map(normalizePlaceholders) : undefined;
  if (normalized.score && typeof normalized.score === "object") {
    normalized.score.findings = Array.isArray(normalized.score.findings) ? normalized.score.findings.filter(value => typeof value === "string").map(normalizePlaceholders) : [];
  }
  if (normalized.lorebook && (!normalized.lorebook.entries || typeof normalized.lorebook.entries !== "object")) delete normalized.lorebook;
  return normalized;
}

async function chat(baseUrl: string, model: string, system: string, prompt: string): Promise<string> {
  return window.__TAURI__!.core.invoke("ollama_chat", { baseUrl, model, system, prompt });
}

export async function improveStandaloneGreeting(args: {
  baseUrl: string; model: string; text: string; instruction: string; language: string; nsfw: boolean;
}): Promise<string> {
  if (!args.model) throw new Error("Bitte zuerst ein Ollama-Modell auswählen.");
  if (!args.text.trim()) throw new Error("Die Begrüßung ist leer.");
  const adult = args.nsfw
    ? "Explicit fictional adult content may be preserved and competently edited. All characters are consenting adults."
    : "Keep the result non-explicit and safe-for-work.";
  const system = `You edit one reusable standalone SillyTavern alternate greeting. ${adult}
You receive no character card and must not assume any facts beyond the supplied greeting. Preserve its language unless explicitly asked to translate. Preserve literal {{char}} and {{user}} placeholders. Never write actions, thoughts, dialogue, feelings, identity, or decisions for {{user}}. Return only strict JSON as {"fields":{"standalone_greeting":"complete replacement"},"explanation":"short summary"}.`;
  const prompt = `Improve this standalone alternate greeting. User request: ${args.instruction || "Improve prose, atmosphere, clarity, roleplay hook, and user agency."}
The replacement must remain a complete playable opening. Do not add facts that require unavailable card context.
STANDALONE GREETING:
${args.text}`;
  const raw = await chat(args.baseUrl, args.model, system, prompt);
  let result: AiResult;
  try { result = normalizeResult(extractJson(raw)); }
  catch {
    const repaired = await chat(
      args.baseUrl, args.model,
      "Repair the supplied response into strict JSON. Do not add, summarize, or remove prose.",
      raw
    );
    result = normalizeResult(extractJson(repaired));
  }
  const value = (result.fields as Record<string, string> | undefined)?.standalone_greeting;
  if (!value?.trim()) throw new Error("Ollama hat keine bearbeitete Begrüßung zurückgegeben.");
  return value;
}

function valueForField(card: CharacterCard, field: EditableField): string {

  if (field.startsWith("alternate_greeting:")) return card.data.alternate_greetings[Number(field.split(":")[1])] ?? "";
  if (field.startsWith("mes_example:")) return splitDialogueExamples(card.data.mes_example)[Number(field.split(":")[1])] ?? "";
  const value = card.data[field as CoreEditableField];
  return typeof value === "string" ? value : "";
}

function focusedPayload(card: CharacterCard, selected: EditableField[], action: string): string {
  if (!["edit", "translate", "optimize"].includes(action) || !selected.length) return JSON.stringify(card.data);
  const fields = Object.fromEntries(selected.map(field => [field, valueForField(card, field)]));
  const context = {
    name: card.data.name,
    description: selected.includes("description") ? undefined : card.data.description.slice(0, 1200),
    personality: selected.includes("personality") ? undefined : card.data.personality.slice(0, 1200),
    scenario: selected.includes("scenario") ? undefined : card.data.scenario.slice(0, 1200)
  };
  return JSON.stringify({ fields, compact_context: context });
}

export async function runAi(args: {
  baseUrl: string; model: string; action: "edit" | "translate" | "suggest" | "grade" | "lorebook" | "optimize";
  card: CharacterCard; selected: EditableField[]; instruction: string; language: string; nsfw: boolean;
  optimizationStrength?: "gentle" | "balanced" | "strong";
}): Promise<AiResult> {
  if (!args.model) throw new Error("Bitte zuerst ein Ollama-Modell auswählen.");
  const adult = args.nsfw
    ? "NSFW mode is enabled. All characters are consenting adults. Preserve and competently edit explicit fictional adult content without euphemizing or moral commentary. Never introduce minors, coercion, or illegal content."
    : "NSFW mode is disabled. Keep the result non-explicit and safe-for-work.";
  const common = `You are the offline writing engine of Silly EasyChar, a SillyTavern character-card editor. ${adult}
Always write the literal placeholders {{char}} and {{user}}. Never output bare User/user or Char/char when referring to them. In German, placeholders behave like proper names: never put articles before them. Write "mit {{user}}", "an {{user}}" and "{{user}} geht", never "mit dem {{user}}", "an den {{user}}" or "der {{user}} geht". Apply the same rule to {{char}}. Never write dialogue, thoughts, feelings, or decisions for {{user}}. Maintain internal consistency.
Keep content in its correct injection layer: system core 0–100; world info before 101–200; character definition 201–300; behavioral rules 301–400; character-specific lore 401–500; persona 501–600; example dialogue 601–700; chat history 701–800; post-instructions 801–900.
Return ONLY strict, parseable JSON with double-quoted property names and escaped line breaks. Never use markdown fences, comments, trailing commas, or single-quoted JSON.`;
  const selected = args.selected.map(f => `${f} (${fieldLabel(f)})`).join(", ");
  const payload = focusedPayload(args.card, args.selected, args.action);
  let task = "";
  const optimizationProfiles = {
    gentle: "Description: at most about 180 tokens in 4–8 sentences. Personality: 8–12 concise bullets. Scenario: 2–3 sentences. Message Examples: at most 2–3 short blocks. System Prompt: 60–100 tokens in 2–6 rules.",
    balanced: "Description: at most about 120 tokens in 3–6 sentences. Personality: 5–10 concise bullets. Scenario: 1–2 sentences. Message Examples: at most 1–2 short blocks. System Prompt: 40–80 tokens in 2–6 rules.",
    strong: "Description: at most about 80 tokens in 2–4 sentences. Personality: 4–7 terse bullets. Scenario: exactly 1 concise sentence. Message Examples: exactly 1 short block. System Prompt: 30–50 tokens in 2–4 rules."
  };
  const optimizationProfile = optimizationProfiles[args.optimizationStrength ?? "balanced"];
  if (args.action === "translate") task = `Translate ONLY these fields to ${args.language}: ${selected}. Preserve placeholders, markdown, line breaks, names, and meaning. Return {"fields":{"field":"translation"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit") task = `Edit ONLY these fields: ${selected}. User request: ${args.instruction || "Improve quality, clarity, consistency, and roleplay utility."}
Create substantially expanded, complete replacements in one pass instead of merely appending a few sentences. Unless the user requests brevity, aim for roughly 500–1200 characters each for description/personality/scenario, 600–1600 for first_mes, and 3–5 varied exchanges only when editing the legacy combined mes_example field. Keep the name concise. Use all useful facts already present, add fitting detail without contradictions, and distribute information into its semantically correct field; never stuff personality, scenario, examples, or instructions into description.
Preserve the existing language of each non-empty source field. The configured output language applies only to explanations and newly created empty fields. Never translate an edited field unless the user explicitly requests translation.
For alternate greetings, return each exact dynamic key such as "alternate_greeting:0" separately. Each alternate greeting must be a complete 600–1600 character roleplay opening with atmosphere, visible action, a distinct situation, a clear conversation hook, and at least one natural {{user}} reference; never decide {{user}}'s response or actions. Return {"fields":{"field":"complete replacement"},"explanation":"short summary in ${args.language}"}.`;
  if (args.action === "edit" && args.selected.some(field => field.startsWith("mes_example:"))) task += ` Each selected mes_example:N key is exactly one independent dialogue example. Return the same exact dynamic key, begin it with exactly one <START> line, include literal {{user}}: and {{char}}: prefixes, and keep its scene, mood, and nuance independent from every other example. Never merge examples or return multiple <START> blocks for one key.`;
  if (args.action === "edit" && args.selected.includes("mes_example")) task += ` Every separate dialogue example must begin with <START> on its own line, followed by at least one {{user}}: message and one {{char}}: message. Use the literal prefixes exactly, create 3–5 separate <START> blocks, and demonstrate the character voice, mannerisms, actions, and emotional range. Never use User:, Char:, character names, or one continuous block as speaker prefixes.`;
  if (args.action === "edit" && args.selected.includes("system_prompt")) task += ` SYSTEM PROMPT HARD LIMIT: 2–6 short non-negotiable behavioral or formatting rules, approximately 30–100 tokens and never more than 650 characters. Do not place character facts, lore, voice, ordinary style guidance, examples, or jailbreak walls here. Return an empty string if no system-level rule is needed.`;
  if (args.action === "edit" && args.selected.includes("post_history_instructions")) task += ` POST-HISTORY HARD LIMIT: one concise reinforcement, never more than 350 characters; return an empty string if redundant.`;
  if (args.action === "optimize") task = `Rewrite ONLY these fields to reduce prompt-token usage without losing identity, essential facts, continuity, voice, user agency, placeholders, or roleplay utility: ${selected}. Return {"fields":{"field":"complete compact replacement"},"explanation":"short summary in ${args.language}"}. Strength profile: ${optimizationProfile} Personality must use compact bullets without synonym repetition. Scenario contains only the starting situation. Message Examples use literal {{user}}: and {{char}}: prefixes. System Prompt contains only unique, non-negotiable rules; style guidance does not belong there. Post-History Instructions are one short reinforcement or an empty string when redundant. First Message and alternate greetings stay playable but lose repeated exposition and decorative padding. Do not translate. Do not invent new facts. Prefer removing duplication over removing unique information.`;
  if (args.action === "suggest") task = `Review the card and return 3–7 concrete improvements as {"suggestions":["..."],"explanation":"..."} in ${args.language}. Do not rewrite fields.`;
  if (args.action === "grade") task = `Grade the card out of 100. Return {"score":{"total":0,"structure":0,"coherence":0,"roleplay":0,"creativity":0,"polish":0,"findings":["specific actionable improvement", "..."]}}. Each subscore is 0–20 and must sum to total. Findings must be concrete editing instructions in ${args.language}, ready to paste into an editing request. Check correct field placement, placeholders, depth, consistency, user agency, and dialogue examples especially carefully.`;
  if (args.action === "lorebook") task = `Create a production-ready SillyTavern lorebook from the card and this request: ${args.instruction || "Extract important characters, locations, items, factions and rules."} Return {"lorebook":{"entries":{"0":{...}}}}. Each entry MUST contain uid,key,keysecondary,comment,content,constant,selective,selectiveLogic,addMemo,order,position,disable,probability,useProbability,depth,delay,cooldown,sticky,vectorized,ignoreBudget,excludeRecursion,preventRecursion. Use string keys matching uid. Every content block must be concise, standalone, normally 1–3 sentences or roughly 20–60 tokens, and contain only information that should enter the prompt; do not repeat ordinary card fields. Split unrelated concepts. Choose settings per entry: position 0 for general world facts before the character definition, position 1 for character-specific lore after it, positions 5 or 6 only for genuine example-message material, and position 4 only for a deliberately persistent in-chat instruction. Higher order means closer to the end of context and more influence. Use constant true only for essential information that must always load; otherwise provide specific primary trigger keys. Use secondary keys with selective true only to disambiguate broad primary keys. Probability should normally be 100 and lower only for intentionally random content. Depth matters only at position 4. Prevent or exclude recursion only when activation chains would be noisy or unsafe. Set vectorized false and useProbability true. Output language: ${args.language}.`;
  const text = await chat(args.baseUrl, args.model, common, `${task}\n\nCARD DATA:\n${payload}`);
  let result: AiResult;
  try {
    result = normalizeResult(extractJson(text));
  } catch {
    const repaired = await chat(
      args.baseUrl,
      args.model,
      "You are a strict JSON repair utility. Return only valid JSON with double-quoted keys and escaped control characters. Preserve all content and the original object structure.",
      `Repair this malformed model response into valid JSON. Do not summarize or omit content:\n\n${text}`
    );
    try {
      result = normalizeResult(extractJson(repaired));
    } catch {
      throw new Error("Das Modell lieferte zweimal ungültiges JSON. Bitte erneut versuchen oder ein anderes Modell wählen.");
    }
  }
  const wantsBrief = /\b(kurz|knapp|short|brief|concise)\b/iu.test(args.instruction);
  if (args.action === "edit" && !wantsBrief) {
    const incomplete = args.selected.filter(field => {
      const minimum = field.startsWith("alternate_greeting:") || field === "first_mes" ? 600
        : field.startsWith("mes_example:") ? 120
        : ["description", "personality", "scenario", "mes_example"].includes(field) ? 500 : 0;
      const value = result.fields?.[field] ?? "";
      const dialogueComplete = !field.startsWith("mes_example:") && field !== "mes_example" || (
        field.startsWith("mes_example:")
          ? (value.match(/<START>/g) ?? []).length === 1 && value.includes("{{user}}:") && value.includes("{{char}}:")
          :
        (value.match(/<START>/g) ?? []).length >= 3 &&
        value.includes("{{user}}:") && value.includes("{{char}}:")
      );
      return minimum > 0 && (value.length < minimum || !dialogueComplete || (field.startsWith("alternate_greeting:") && !value.includes("{{user}}")));
    });
    if (incomplete.length) {
      const retry = await chat(
        args.baseUrl, args.model, common,
        `The previous result was too short or incomplete for these fields: ${incomplete.map(fieldLabel).join(", ")}. Rewrite ONLY those exact keys as complete replacements. Each description/personality/scenario/mes_example must contain at least 500 characters; each first message or alternate greeting at least 600 characters. Every alternate greeting must naturally include {{user}}. A dynamic mes_example:N key is one independent block of at least 120 characters with exactly one <START> plus literal {{user}}: and {{char}}: prefixes; never merge its scene with another example. The legacy mes_example field requires 3–5 separate blocks. Preserve the source field language unless translation was explicitly requested. Return strict JSON as {"fields":{"exact_key":"complete replacement"},"explanation":"..."}.\n\nPREVIOUS RESULT:\n${JSON.stringify(result)}\n\nCARD DATA:\n${payload}`
      );
      try {
        const expanded = normalizeResult(extractJson(retry));
        result.fields = { ...result.fields, ...expanded.fields };
        result.explanation = expanded.explanation ?? result.explanation;
      } catch { /* Keep the valid first result if the depth retry fails. */ }
    }
  }
  if (args.action === "edit") {
    const oversized = args.selected.filter(field => {
      const value = result.fields?.[field] ?? "";
      return (field === "system_prompt" && value.length > 650) || (field === "post_history_instructions" && value.length > 350);
    });
    if (oversized.length) {
      const retry = await chat(
        args.baseUrl, args.model, common,
        `The previous response violated a hard length limit. Rewrite ONLY: ${oversized.join(", ")}. System Prompt must contain only 2–6 indispensable rules, about 30–100 tokens and at most 650 characters. Post-History Instructions must be at most 350 characters. Remove lore, character facts, examples, repeated style guidance, and jailbreak walls. Return strict JSON as {"fields":{"exact_key":"compact replacement"},"explanation":"..."}. PREVIOUS RESULT: ${JSON.stringify(result)}`
      );
      const compact = normalizeResult(extractJson(retry));
      for (const field of oversized) {
        const value = compact.fields?.[field];
        const limit = field === "system_prompt" ? 650 : 350;
        if (typeof value !== "string" || value.length > limit) {
          throw new Error("Das Modell hat die feste Längengrenze für " + fieldLabel(field) + " zweimal überschritten.");
        }
        result.fields ??= {};
        result.fields[field] = value;
      }
    }
  }
  return result;
}
