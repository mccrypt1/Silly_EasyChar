import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyCard } from "./card";
import { extractJson, improveStandaloneGreeting, runAi, suggestStandaloneGreetingTitle } from "./ai";

afterEach(() => vi.unstubAllGlobals());

describe("Ollama result handling", () => {
  it("extracts JSON from a fenced response", () => {
    expect(extractJson('```json\\n{"suggestions":["Test"]}\\n```').suggestions).toEqual(["Test"]);
  });

  it("automatically retries an incomplete alternate greeting", async () => {
    const complete = `Hallo {{user}}! ${"Ausführlicher Rollenspieleinstieg. ".repeat(22)}`;
    const invoke = vi.fn()
      .mockResolvedValueOnce('{"fields":{"alternate_greeting:0":"Kurz {{user}}"}}')
      .mockResolvedValueOnce(JSON.stringify({ fields: { "alternate_greeting:0": complete } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.alternate_greetings = ["Idee"];
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card,
      selected: ["alternate_greeting:0"], instruction: "ausarbeiten", language: "Deutsch", nsfw: false
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.fields?.["alternate_greeting:0"]).toBe(complete);
  });
  it("requires SillyTavern dialogue blocks while preserving an existing field language", async () => {
    const dialogue = [1, 2, 3].map(index =>
      `<START>\n{{user}}: "Question ${index}?"\n{{char}}: *She considers it carefully.* "${"Detailed English character response. ".repeat(7)}"`
    ).join("\n");
    const invoke = vi.fn().mockResolvedValue(JSON.stringify({ fields: { mes_example: dialogue } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.mes_example = "<START>\n{{user}}: Hello\n{{char}}: Hello there.";
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card,
      selected: ["mes_example"], instruction: "Improve the examples", language: "Deutsch", nsfw: false
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Preserve the existing language");
    expect(request.prompt).toContain("3–5 separate <START> blocks");
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("sends and edits one dynamic dialogue example without mixing in other examples", async () => {
    const replacement = `<START>\n{{user}}: Are you ready?\n{{char}}: *She checks the quiet platform clock and smiles.* "We have time for one last coffee before the train arrives, if you want one."`;
    const invoke = vi.fn().mockResolvedValue(JSON.stringify({ fields: { "mes_example:1": replacement } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.mes_example = "<START>\n{{user}}: PRIVATE_FIRST_SCENE\n{{char}}: Hidden\n\n<START>\n{{user}}: Station?\n{{char}}: Train.";
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card,
      selected: ["mes_example:1"], instruction: "Make this scene warmer", language: "English", nsfw: false
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("{{user}}: Station?");
    expect(request.prompt).not.toContain("PRIVATE_FIRST_SCENE");
    expect(request.prompt).toContain("exactly one <START>");
    expect(result.fields?.["mes_example:1"]).toBe(replacement);
  });

  it("asks Ollama to choose contextual lorebook activation settings", async () => {
    const invoke = vi.fn().mockResolvedValue('{"lorebook":{"entries":{}}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "lorebook",
      card: emptyCard(), selected: [], instruction: "", language: "Deutsch", nsfw: true
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Choose settings per entry");
    expect(request.prompt).toContain("position 0 for general world facts");
    expect(request.prompt).toContain("Probability should normally be 100");
    expect(request.prompt).toContain("Depth matters only at position 4");
  });

  it("normalizes an incomplete grading response instead of reading an undefined findings length", async () => {
    const invoke = vi.fn().mockResolvedValue('{"score":{"total":70,"structure":14,"coherence":14,"roleplay":14,"creativity":14,"polish":14}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "grade",
      card: emptyCard(), selected: [], instruction: "", language: "Deutsch", nsfw: true
    });
    expect(result.score?.findings).toEqual([]);
  });

  it("uses a focused payload and field-specific rules for token optimization", async () => {
    const invoke = vi.fn().mockResolvedValue('{"fields":{"scenario":"A compact scenario."}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard();
    card.data.scenario = "Original scenario";
    card.data.post_history_instructions = "PRIVATE_LARGE_UNUSED_FIELD";
    await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "optimize",
      card, selected: ["scenario"], instruction: "", language: "Deutsch", nsfw: true,
      optimizationStrength: "strong"
    });
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("Scenario: exactly 1 concise sentence");
    expect(request.prompt).toContain("Original scenario");
    expect(request.prompt).not.toContain("PRIVATE_LARGE_UNUSED_FIELD");
  });

  it("retries an oversized system prompt and only returns a compact replacement", async () => {
    const oversized = "Keep every rule. ".repeat(80);
    const compact = "Stay in character. Never speak or decide for {{user}}. Keep narration consistent.";
    const invoke = vi.fn()
      .mockResolvedValueOnce(JSON.stringify({ fields: { system_prompt: oversized } }))
      .mockResolvedValueOnce(JSON.stringify({ fields: { system_prompt: compact } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const result = await runAi({
      baseUrl: "http://127.0.0.1:8787", model: "test", action: "edit", card: emptyCard(),
      selected: ["system_prompt"], instruction: "Improve it", language: "Deutsch", nsfw: true
    });
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.fields?.system_prompt).toBe(compact);
    expect((result.fields?.system_prompt ?? "").length).toBeLessThanOrEqual(650);
  });

  it("improves a library greeting without receiving character-card context", async () => {
    const improved = "A complete opening for {{user}}.";
    const invoke = vi.fn().mockResolvedValue(JSON.stringify({ fields: { standalone_greeting: improved } }));
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const result = await improveStandaloneGreeting({
      baseUrl: "http://127.0.0.1:8787",
      model: "test",
      text: "Hello {{user}}.",
      instruction: "Make it atmospheric",
      language: "Deutsch",
      nsfw: true
    });
    const request = invoke.mock.calls[0][1] as { prompt: string; system: string };
    expect(result).toBe(improved);
    expect(request.prompt).toContain("Hello {{user}}.");
    expect(request.prompt).toContain("Make it atmospheric");
    expect(request.system).toContain("receive no character card");
    expect(request.prompt).not.toContain("description");
    expect(request.prompt).not.toContain("personality");
    expect(request.prompt).not.toContain("scenario");
  });

  it("suggests a neutral standalone greeting title with a hard ten-word limit", async () => {
    const invoke = vi.fn().mockResolvedValue('{"title":"Rainy evening pizza delivery outside a warmly lit apartment doorway together"}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const result = await suggestStandaloneGreetingTitle({
      baseUrl: "http://127.0.0.1:8787",
      model: "test",
      text: "A courier waits outside in the rain with two pizzas.",
      language: "English"
    });
    const request = invoke.mock.calls[0][1] as { prompt: string; system: string };
    expect(result.split(" ")).toHaveLength(10);
    expect(request.prompt).toContain("A courier waits outside in the rain with two pizzas.");
    expect(request.system).toContain("no character card metadata");
    expect(request.system).toContain("at most 10 words");
    expect(request.prompt).not.toContain("creator_notes");
    expect(request.prompt).not.toContain("alternate_greetings");
  });

  it("edits a selected passage without forcing a complete field rewrite", async () => {
    const invoke = vi.fn().mockResolvedValue('{"fields":{"description":"a tighter sentence"}}');
    vi.stubGlobal("window", { __TAURI__: { core: { invoke } } });
    const card = emptyCard(); card.data.description = "a verbose sentence";
    const result = await runAi({ baseUrl: "http://127.0.0.1:11434", model: "test", action: "edit", card, selected: ["description"], instruction: "make it clearer", language: "English", nsfw: false, selectionMode: true });
    expect(result.fields?.description).toBe("a tighter sentence");
    expect(invoke).toHaveBeenCalledTimes(1);
    const request = invoke.mock.calls[0][1] as { prompt: string };
    expect(request.prompt).toContain("selected passage");
    expect(request.prompt).toContain("Do not expand it into a complete card field");
  });
});

