import { describe, expect, it } from "vitest";
import { parseCsv, parseTrNumber } from "./format";

describe("parseTrNumber", () => {
  it.each([
    ["18.999,90", 18999.9], ["18999,90", 18999.9], ["18999.90", 18999.9], ["18.999", 18999],
    ["1.234.567,5", 1234567.5], ["1,234.50", 1234.5], ["₺ 21.500", 21500], ["250", 250], ["0,5", 0.5],
  ])("%s → %d", (raw, n) => expect(parseTrNumber(raw)).toBe(n));
  it.each(["", "abc", "12a", null])("%s → null", (raw) => expect(parseTrNumber(raw as string)).toBeNull());
});

describe("parseCsv", () => {
  it("noktalı virgül, tırnak ve BOM", () => {
    const rows = parseCsv('﻿brand;model_code;name\nBosch;WAN28281TR;"Çamaşır; 9 kg ""A"""\n\n');
    expect(rows).toEqual([{ brand: "Bosch", model_code: "WAN28281TR", name: 'Çamaşır; 9 kg "A"' }]);
  });
  it("virgül ayırıcı ve CRLF", () => {
    expect(parseCsv("a,b\r\n1,2\r\n3,4")).toEqual([{ a: "1", b: "2" }, { a: "3", b: "4" }]);
  });
});
