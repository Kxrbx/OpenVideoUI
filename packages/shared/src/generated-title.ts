const MAX_TITLE_LENGTH = 60;
const MAX_TITLE_WORDS = 6;

const TITLE_PREFIX_PATTERN = /^(?:title|titre)\s*[:\-]\s*/i;
const SURROUNDING_PUNCTUATION_PATTERN = /^[\s"'`*_#()[\]{}:;,.!?-]+|[\s"'`*_#()[\]{}:;,.!?-]+$/g;
const META_TITLE_PATTERNS = [
  /^(?:okay|ok|alright|sure|so)\b/i,
  /\bthe user\b/i,
  /\buser is asking\b/i,
  /\basking about\b/i,
  /\bthis (?:chat|conversation|request|prompt)\b/i,
  /\bthe assistant\b/i,
  /\bthe model\b/i,
  /\bquestion about\b/i
];

export type TitleGenerationMessage = {
  role: "system" | "user";
  content: string;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function stripTitleDecoration(value: string) {
  return normalizeWhitespace(value)
    .replace(TITLE_PREFIX_PATTERN, "")
    .replace(SURROUNDING_PUNCTUATION_PATTERN, "")
    .trim();
}

function limitTitleWords(value: string) {
  const words = value.split(" ").filter(Boolean);

  if (words.length <= MAX_TITLE_WORDS) {
    return value;
  }

  return words.slice(0, MAX_TITLE_WORDS).join(" ");
}

function limitTitleLength(value: string) {
  if (value.length <= MAX_TITLE_LENGTH) {
    return value;
  }

  const clipped = value.slice(0, MAX_TITLE_LENGTH).trim();
  const lastSpace = clipped.lastIndexOf(" ");

  if (lastSpace >= 24) {
    return clipped.slice(0, lastSpace).trim();
  }

  return clipped;
}

export function sanitizeGeneratedTitle(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const firstLine = value
    .split(/\r?\n/)
    .map(stripTitleDecoration)
    .find(Boolean);

  if (!firstLine) {
    return null;
  }

  const title = stripTitleDecoration(limitTitleLength(limitTitleWords(firstLine)));

  if (META_TITLE_PATTERNS.some((pattern) => pattern.test(title))) {
    return null;
  }

  return title.length > 0 ? title : null;
}

export function buildFallbackTitle(prompt: string, fallback = "Untitled generation") {
  const normalizedPrompt = normalizeWhitespace(prompt);

  if (!normalizedPrompt) {
    return fallback;
  }

  const title = stripTitleDecoration(limitTitleLength(limitTitleWords(normalizedPrompt)));

  return title || fallback;
}

export function buildTitleGenerationMessages(prompt: string): TitleGenerationMessage[] {
  return [
    {
      role: "system",
      content:
        "Create a short subject title for a generated image, video, or chat. Use the same language as the prompt when it is clear. Prefer a compact noun phrase, not a sentence. Return only the title, 2 to 6 words, maximum 60 characters, no quotes, no decorative punctuation, no explanation. Never mention the user, assistant, model, prompt, request, or chat. Never write meta phrases like 'the user is asking about', 'question about', or 'this chat is about'."
    },
    {
      role: "user",
      content: prompt
    }
  ];
}
