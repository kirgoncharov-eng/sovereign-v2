// Реплики добавляет редактор отдельными B-PR после вычитки. Без авторской строки советник молчит.
import type { Bloc } from '../game/types.ts';
export interface AdvisorSpeech {
  strong?: string;
  weak?: string;
  lobby?: Partial<Record<Bloc, string>>;
  challenge?: { after: string; text: string };
}
export type AdvisorDialogue = Record<string, Partial<Record<number, Record<string, AdvisorSpeech>>>>;
// Дело → индекс варианта (0..2) → должность → тон. Полные предложения, не фрагменты для сборки.
export const ADVISOR_DIALOGUE: AdvisorDialogue = {};
