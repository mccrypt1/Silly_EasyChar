import { describe, expect, it } from "vitest";
import { CREATOR_NOTE_STAMP, emptyCard, normalizeCard, normalizeCardPlaceholders, normalizeLoreEntry, normalizePlaceholders, prepareCardForExport, toV3Card } from "./card";

describe("SillyTavern placeholders", () => {
  it("normalizes bare and spaced user/char placeholders", () => {
    expect(normalizePlaceholders("User spricht mit Char. {{ User }} bleibt. character"))
      .toBe("{{user}} spricht mit {{char}}. {{user}} bleibt. character");
  });

  it("normalizes fields, alternate greetings, and lorebook content", () => {
    const card = emptyCard();
    card.data.scenario = "Der User trifft den Char.";
    card.data.alternate_greetings = ["Hallo User"];
    card.data.character_book = {
      entries: [{
        uid: 0, key: [], keysecondary: [], comment: "Test", content: "Char kennt User.",
        constant: false, selective: false, selectiveLogic: 0, addMemo: true, order: 100,
        position: 0, disable: false, probability: 100, useProbability: true, depth: 4,
        delay: 0, cooldown: 0, sticky: 0, vectorized: false, ignoreBudget: false,
        excludeRecursion: false, preventRecursion: false
      }]
    };
    normalizeCardPlaceholders(card);
    expect([card.data.scenario, card.data.alternate_greetings[0], card.data.character_book.entries[0].content])
      .toEqual(["{{user}} trifft {{char}}.", "Hallo {{user}}", "{{char}} kennt {{user}}."]);
  });

  it("normalizes nullable text fields to safe strings", () => {
    const card = normalizeCard({ data: {
      personality: null, creator_notes: null, system_prompt: null, post_history_instructions: null
    } });
    expect([card.data.personality, card.data.creator_notes, card.data.system_prompt, card.data.post_history_instructions])
      .toEqual(["", "", "", ""]);
  });
});

  it("removes German articles and expands contractions before placeholders", () => {
    const text = "Der {{user}} geht an den User und wartet beim Char. Danach spricht die {{char}} mit dem {{user}}.";
    expect(normalizePlaceholders(text))
      .toBe("{{user}} geht an {{user}} und wartet bei {{char}}. Danach spricht {{char}} mit {{user}}.");
  });

  it("adds the creator stamp only to an export copy", () => {
    const card = emptyCard();
    card.data.creator_notes = "Eigene Hinweise zuerst.";
    const exported = prepareCardForExport(card);
    expect(card.data.creator_notes).toBe("Eigene Hinweise zuerst.");
    expect(exported.data.creator_notes).toBe(`Eigene Hinweise zuerst.\n\n${CREATOR_NOTE_STAMP}`);
    expect(prepareCardForExport(exported).data.creator_notes.match(/Silly EasyChar Studio/g)).toHaveLength(1);
    expect(exported.spec).toBe("chara_card_v3");
    expect(exported.data.group_only_greetings).toEqual([]);
    expect(exported.data.assets?.[0]).toEqual({ type: "icon", uri: "ccdefault:", name: "main", ext: "png" });
  });

  it("projects internal lorebook entries to Character Card V3 fields", () => {
    const card = emptyCard();
    card.data.character_book = { entries: [normalizeLoreEntry({
      uid: 7, key: ["Bakery"], keysecondary: ["Cassandra"], comment: "Workplace",
      content: "{{char}} works here.", selective: true, order: 250, position: 1,
      probability: 75, depth: 6, excludeRecursion: true, preventRecursion: true
    }, 7)] };
    const entry = (toV3Card(card).data.character_book as any).entries[0];
    expect(entry).toMatchObject({ keys: ["Bakery"], secondary_keys: ["Cassandra"], enabled: true, insertion_order: 250, use_regex: false, position: 1, probability: 75, depth: 6, excludeRecursion: true, preventRecursion: true });
    expect(entry.key).toBeUndefined();
    expect(entry.disable).toBeUndefined();
    expect(entry.order).toBeUndefined();
  });

  it("uses SillyTavern's default talkativeness value", () => {
    expect(emptyCard().data.extensions.talkativeness).toBe("0.5");
  });

  it("preserves extension talkativeness and migrates a legacy root value", () => {
    expect(normalizeCard({ data: { extensions: { talkativeness: "0.75" } } }).data.extensions.talkativeness).toBe("0.75");
    expect(normalizeCard({ data: { talkativeness: "0.8" } }).data.extensions.talkativeness).toBe("0.8");
  });

  it("preserves unknown V3 data at every supported level", () => {
    const source: any = {
      spec: "chara_card_v3", spec_version: "3.0", vendor_root: { enabled: true },
      data: { name: "Extension test", vendor_data: [1, 2, 3], character_book: { name: "Book", vendor_book: "kept", entries: [{ id: 4, keys: ["x"], content: "Lore", vendor_entry: { color: "violet" } }] } }
    };
    const exported: any = toV3Card(normalizeCard(source));
    expect(exported.vendor_root).toEqual({ enabled: true });
    expect(exported.data.vendor_data).toEqual([1, 2, 3]);
    expect(exported.data.character_book.vendor_book).toBe("kept");
    expect(exported.data.character_book.entries[0].vendor_entry).toEqual({ color: "violet" });
  });

  it("exports V3 JSON without embedded image data while retaining asset metadata", () => {
    const json = JSON.stringify(toV3Card(prepareCardForExport(emptyCard())));
    expect(json).not.toContain("data:image/");
    expect(JSON.parse(json).data.assets[0].uri).toBe("ccdefault:");
  });
