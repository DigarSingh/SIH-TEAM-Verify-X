/**
 * Built-in interpreter for plain-language course searches ("advanced radar course under 3 hours").
 * It works without any AI service: it recognises a level, a maximum duration, competencies and a
 * category, and leaves the remaining words as a text query. The AI model, when configured, is an
 * upgrade for paraphrases and synonyms; it produces the same structure, validated the same way.
 */

export type Level = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export interface SearchIntent {
  /** Free-text words to match against titles and descriptions. */
  keywords: string;
  competencyIds: string[];
  difficulty: Level | null;
  category: string | null;
  maxDurationMinutes: number | null;
}

export interface SearchVocabulary {
  competencies: { id: string; name: string; code: string }[];
  categories: string[];
}

const LEVEL_WORDS: Record<string, Level> = {
  beginner: 'BEGINNER',
  beginners: 'BEGINNER',
  basic: 'BEGINNER',
  basics: 'BEGINNER',
  introductory: 'BEGINNER',
  introduction: 'BEGINNER',
  intro: 'BEGINNER',
  foundation: 'BEGINNER',
  foundations: 'BEGINNER',
  starter: 'BEGINNER',
  intermediate: 'INTERMEDIATE',
  advanced: 'ADVANCED',
  expert: 'ADVANCED',
  specialist: 'ADVANCED',
};

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'to', 'of', 'in', 'on', 'at', 'about', 'with', 'from', 'by', 'my', 'me', 'i', 'we', 'you', 'is', 'are', 'be',
  'want', 'need', 'looking', 'find', 'show', 'get', 'better', 'learn', 'learning', 'course', 'courses', 'training', 'trainings', 'class', 'classes',
  'some', 'any', 'that', 'this', 'please', 'help', 'how', 'can', 'do', 'improve', 'level', 'skills', 'skill', 'under', 'less', 'than', 'within', 'up',
  'below', 'maximum', 'max', 'hours', 'hour', 'hrs', 'hr', 'minutes', 'minute', 'mins', 'min',
]);

const tokenize = (text: string): string[] => text.toLowerCase().match(/[a-z0-9]+/g) ?? [];

/** "under 2 hours", "less than 90 minutes", "up to 1.5 h" → minutes */
function parseMaxDuration(text: string): { minutes: number | null; consumed: string[] } {
  const match = /(?:under|less than|within|up to|below|no more than|max(?:imum)?(?: of)?)\s+(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/i.exec(text);
  if (!match) return { minutes: null, consumed: [] };
  const amount = Number(match[1]);
  const minutes = /^h/i.test(match[2] ?? '') ? amount * 60 : amount;
  return { minutes: Math.round(minutes), consumed: tokenize(match[0]) };
}

export function interpretSearch(query: string, vocabulary: SearchVocabulary): SearchIntent {
  const tokens = tokenize(query);
  const consumed = new Set<string>();

  // Level
  let difficulty: Level | null = null;
  for (const token of tokens) {
    const level = LEVEL_WORDS[token];
    if (level) {
      difficulty ??= level;
      consumed.add(token);
    }
  }

  // Maximum duration
  const duration = parseMaxDuration(query);
  duration.consumed.forEach((token) => consumed.add(token));

  // Competencies: a distinctive word of the name (one that appears in only one competency name), the
  // code, or every word of the name.
  const nameTokens = vocabulary.competencies.map((competency) => tokenize(competency.name).filter((token) => token.length >= 3));
  const frequency = new Map<string, number>();
  nameTokens.forEach((list) => new Set(list).forEach((token) => frequency.set(token, (frequency.get(token) ?? 0) + 1)));
  const querySet = new Set(tokens);
  const competencyIds: string[] = [];
  vocabulary.competencies.forEach((competency, index) => {
    const words = nameTokens[index] ?? [];
    const allWords = words.length > 0 && words.every((word) => querySet.has(word));
    const distinctive = words.filter((word) => (frequency.get(word) ?? 0) === 1 && querySet.has(word));
    const byCode = querySet.has(competency.code.toLowerCase());
    if (allWords || distinctive.length > 0 || byCode) {
      competencyIds.push(competency.id);
      (allWords ? words : distinctive).forEach((word) => consumed.add(word));
    }
  });

  // Category
  const lower = query.toLowerCase();
  const category = vocabulary.categories.find((name) => lower.includes(name.toLowerCase())) ?? null;
  if (category) tokenize(category).forEach((token) => consumed.add(token));

  const keywords = tokens.filter((token) => !consumed.has(token) && !STOP_WORDS.has(token) && !/^\d+(\.\d+)?$/.test(token)).join(' ');
  return { keywords, competencyIds: competencyIds.slice(0, 3), difficulty, category, maxDurationMinutes: duration.minutes };
}

/** Turns an intent into a short sentence the user can check ("Radar Meteorology · Advanced · up to 3 h"). */
export function describeIntent(intent: SearchIntent, vocabulary: SearchVocabulary): string[] {
  const parts: string[] = [];
  for (const id of intent.competencyIds) {
    const competency = vocabulary.competencies.find((item) => item.id === id);
    if (competency) parts.push(competency.name);
  }
  if (intent.category) parts.push(`Category: ${intent.category}`);
  if (intent.difficulty) parts.push(intent.difficulty.charAt(0) + intent.difficulty.slice(1).toLowerCase());
  if (intent.maxDurationMinutes) parts.push(`up to ${intent.maxDurationMinutes >= 60 ? `${Math.round((intent.maxDurationMinutes / 60) * 10) / 10} h` : `${intent.maxDurationMinutes} min`}`);
  if (intent.keywords) parts.push(`“${intent.keywords}”`);
  return parts;
}
