import { describe, expect, it } from "vitest";
import { emptyCard, normalizeCardPlaceholders, normalizePlaceholders } from "./card";

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
      .toEqual(["Der {{user}} trifft den {{char}}.", "Hallo {{user}}", "{{char}} kennt {{user}}."]);
  });
});
