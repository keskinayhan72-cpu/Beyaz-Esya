export type ExtractedOffer = { price: number; currency: string; seller: string | null; inStock: boolean | null; condition: string; aggregate: boolean; note?: string };
export type Extracted = {
  source: string | null; url: string; name: string | null; brand: string | null; modelCode: string | null;
  gtin: string | null; price: number | null; inStock: boolean | null; condition: string; seller: string | null;
  offers: ExtractedOffer[]; warnings: string[];
};
export const HOST_SOURCES: [string, string][];
export function sourceForUrl(url: string): string | null;
export function guessModel(name: string | null, brand: string | null): string | null;
export function checkGtin(value: unknown): { gtin: string | null; warning: string | null };
export function extractProduct(raw: { url: string; jsonLd?: string[]; meta?: Record<string, string>; title?: string; html?: string }): Extracted;
