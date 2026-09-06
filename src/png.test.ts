import { describe, expect, it } from "vitest";
import { CREATOR_NOTE_STAMP, emptyCard, normalizeLoreEntry, prepareCardForExport } from "./card";
import { embedCard, extractCard } from "./png";

const onePixelPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), c => c.charCodeAt(0));

describe("character card PNG", () => {
  it("prefers complete Unicode V3 metadata from a dual-format PNG", async () => {
    const card = emptyCard(); card.data.name = "Lila ✨"; card.data.description = "Grüße {{user}}";
    card.data.character_book = { entries: [normalizeLoreEntry({
      key: ["Pizza"], comment: "Test", content: "{{char}} delivers pizza.", order: 250
    }, 0)] };

    const blob = embedCard(onePixelPng.buffer as ArrayBuffer, prepareCardForExport(card));
    const parsed = extractCard(await blob.arrayBuffer());
    expect(parsed?.spec).toBe("chara_card_v3");
    expect(parsed?.data.name).toBe("Lila ✨");
    expect(parsed?.data.description).toBe("Grüße {{user}}");
    expect(parsed?.data.creator_notes).toBe(CREATOR_NOTE_STAMP);
    expect(parsed?.data.group_only_greetings).toEqual([]);
    expect(parsed?.data.character_book?.entries[0].key).toEqual(["Pizza"]);
    expect(parsed?.data.character_book?.entries[0].order).toBe(250);
  });
});
