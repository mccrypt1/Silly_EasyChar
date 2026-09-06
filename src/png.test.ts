import { describe, expect, it } from "vitest";
import { emptyCard } from "./card";
import { embedCard, extractCard } from "./png";

const onePixelPng = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), c => c.charCodeAt(0));

describe("character card PNG", () => {
  it("embeds and extracts Unicode v2 metadata", async () => {
    const card = emptyCard(); card.data.name = "Lila ✨"; card.data.description = "Grüße {{user}}";
    const blob = embedCard(onePixelPng.buffer as ArrayBuffer, card);
    const parsed = extractCard(await blob.arrayBuffer());
    expect(parsed?.data.name).toBe("Lila ✨"); expect(parsed?.data.description).toBe("Grüße {{user}}");
  });
});
