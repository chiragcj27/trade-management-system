import { HINGLISH } from "./hinglish";

export type Lang = "hi" | "en";

const STORAGE_KEY = "beat-register.lang";
let current: Lang = "hi";

export const getLang = (): Lang => current;

export function applyLang(lang: Lang) {
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Private browsing can block storage; the choice still holds for this visit.
  }
}

export function storedLang(): Lang | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "hi" ? value : null;
  } catch {
    return null;
  }
}

interface Pattern {
  regex: RegExp;
  order: number[];
  template: string;
  literal: number;
}

/** Entries with {0} match sentences that carry names and amounts, longest wording first. */
const patterns: Pattern[] = Object.entries(HINGLISH)
  .filter(([key]) => key.includes("{0}"))
  .map(([key, template]) => {
    const order: number[] = [];
    const source = key
      .split(/(\{\d\})/)
      .map((part) => {
        const slot = /^\{(\d)\}$/.exec(part);
        if (slot) {
          order.push(Number(slot[1]));
          return "(.+?)";
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      })
      .join("");
    return { regex: new RegExp(`^${source}$`), order, template, literal: key.replace(/\{\d\}/g, "").length };
  })
  .sort((a, b) => b.literal - a.literal);

const cache = new Map<string, string>();

function translate(text: string): string {
  const exact = HINGLISH[text];
  if (exact !== undefined) return exact;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  let result = text;
  for (const pattern of patterns) {
    const match = pattern.regex.exec(text);
    if (!match) continue;
    result = pattern.template.replace(/\{(\d)\}/g, (_, slot: string) => {
      const value = match[pattern.order.indexOf(Number(slot)) + 1] ?? "";
      return HINGLISH[value] ?? value;
    });
    break;
  }
  cache.set(text, result);
  return result;
}

/** Shows text in the chosen language, and is safe to call on text already translated. */
export function tr(text: string): string {
  if (current === "en" || !text) return text;
  const trimmed = text.trim();
  if (!trimmed) return text;
  const start = text.indexOf(trimmed);
  return text.slice(0, start) + translate(trimmed) + text.slice(start + trimmed.length);
}
