const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 2 });
const pctFmt = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 });
const dt = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Istanbul" });

export const fmtTL = (n: number | null | undefined) => (n === null || n === undefined ? "—" : tl.format(n));
export const fmtPct = (n: number | null | undefined) => (n === null || n === undefined ? "—" : pctFmt.format(n));
export const fmtDate = (d: Date | string | null | undefined) => (d ? dt.format(new Date(d)) : "—");

/**
 * Türkçe/İngilizce sayı yazımlarını çözer: "18.999,90", "18999,90", "18999.90", "18.999".
 * Belirsiz/geçersiz girdide null döner.
 */
export function parseTrNumber(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim().replace(/\s|₺|TL/gi, "");
  if (!s) return null;
  const hasDot = s.includes("."), hasComma = s.includes(",");
  if (hasDot && hasComma) {
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (hasComma) {
    s = /^\d{1,3}(,\d{3})+$/.test(s) && !/^\d+,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** RFC 4180 uyumlu basit CSV ayrıştırıcı. Ayırıcı otomatik: ';' veya ','. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQ = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQ) {
      if (c === '"' && clean[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter((r) => r.some((x) => x.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim().toLowerCase());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}
