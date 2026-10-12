import { describe, expect, it } from "vitest";
import { parseFavoritePaths } from "./library";

describe("favorite paths", () => {
  it("ignores damaged stored favorites", () => {
    expect(parseFavoritePaths(null)).toEqual([]);
    expect(parseFavoritePaths("{")).toEqual([]);
    expect(parseFavoritePaths('{"path":"card.png"}')).toEqual([]);
    expect(parseFavoritePaths('["card.png", 4, "other.json"]')).toEqual(["card.png", "other.json"]);
  });
});
