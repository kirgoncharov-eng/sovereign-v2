import { NEWSPAPER_EDITIONS, OUTCOME_HEADLINE } from "../content/newspaper-editions.ts";
import { hashSeed } from "./engine.ts";

interface HeadlineInput {
  base: string;
  event: string;
  choice: string;
  success: boolean;
  seed: number;
  turn: number;
  ordinary: boolean;
}

export function newspaperName(country: string, seed: number, turn: number): string {
  const editions = NEWSPAPER_EDITIONS[country] ?? ["Вечерняя газета"];
  const offset = hashSeed(seed, "newspaper-edition", country) % editions.length;
  return editions[(offset + Math.max(0, turn - 1)) % editions.length];
}

export function isOrdinaryNewspaperEvent(cardId: string | undefined): boolean {
  return !!cardId && !cardId.includes(":");
}

export function newspaperHeadline(input: HeadlineInput): string {
  if (!input.ordinary) return input.base;
  const variants = input.success ? OUTCOME_HEADLINE.success : OUTCOME_HEADLINE.failure;
  const picked = hashSeed(
    input.seed,
    "newspaper-headline",
    input.turn,
    input.event,
    input.choice,
    input.success ? "success" : "failure",
  ) % (variants.length + 1);
  if (picked === 0) return input.base;
  return variants[picked - 1](input.event, input.choice);
}
