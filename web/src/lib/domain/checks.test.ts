import { describe, expect, it } from "vitest";
import { buildSearchUrl, cellStatus, priorityScore } from "./checks";

const now = new Date("2026-11-04T12:00:00Z");
const recent = new Date("2026-11-04T10:00:00Z");

describe("arama bağlantısı", () => {
  it("sorguyu kodlar", () =>
    expect(buildSearchUrl("https://www.trendyol.com/sr?q={q}", "WAN 28281/TR")).toBe("https://www.trendyol.com/sr?q=WAN%2028281%2FTR"));
  it("şablon veya sorgu yoksa null", () => {
    expect(buildSearchUrl(null, "x")).toBeNull();
    expect(buildSearchUrl("https://a/{q}", " ")).toBeNull();
  });
});

describe("hücre durumu", () => {
  it.each([
    [null, "missing"],
    [{ observedAt: recent, delivery: "verified", isTest: true }, "missing"],
    [{ observedAt: new Date("2026-11-01T00:00:00Z"), delivery: "verified", isTest: false }, "stale"],
    [{ observedAt: recent, delivery: "restricted", isTest: false }, "restricted"],
    [{ observedAt: recent, delivery: "not_verified", isTest: false }, "usak_unverified"],
    [{ observedAt: recent, delivery: "verified", isTest: false }, "ok"],
  ] as const)("%j → %s", (obs, expected) => expect(cellStatus(obs, now, 48)).toBe(expected));

  it("öncelik", () => expect(priorityScore(["missing", "ok", "stale"])).toBe(5));
});
