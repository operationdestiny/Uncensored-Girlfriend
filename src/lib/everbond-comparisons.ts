import type { Metadata } from "next";
/** Deprecated competitor marketing from the previous brand: intentionally emptied. */
export type ComparisonFeature = { label: string; everbond: string; competitor: string; advantage?: "everbond" | "competitor" | "tie" };
export type EverBondComparison = {
  slug: string; competitor: string; competitorUrl: string; competitorStrength: string;
  title: string; description: string; h1: string; verdict: string; competitorCase: string;
  features: ComparisonFeature[]; whyEverBondWins: Array<{heading:string;body:string}>;
  competitorWins: string[]; finalVerdict: string; faqs: Array<{q:string;a:string}>;
};
export const EVERBOND_COMPARISONS: EverBondComparison[] = [];
export const EVERBOND_COMPARISON_PATHS: string[] = [];
export function getEverBondComparison(_slug: string): EverBondComparison {
  throw new Error("The previous brand's comparison pages are retired.");
}
export function buildEverBondComparisonMetadata(_slug: string): Metadata {
  return { title: "Page retired | Uncensored Girlfriend", robots: { index: false, follow: false } };
}
