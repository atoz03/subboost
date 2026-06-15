export type EmojiSplitResult = {
  emoji: string;
  label: string;
  hasEmojiPrefix: boolean;
};

export function splitLeadingEmoji(raw: string): EmojiSplitResult {
  const name = typeof raw === "string" ? raw.trim() : "";
  const match = name.match(/^(\S+)\s+(.+)$/);
  if (!match) return { emoji: "", label: name, hasEmojiPrefix: false };

  const first = match[1];
  const rest = match[2].trim();

  // 若首段包含字母/数字/中文，大概率不是“emoji 前缀”
  if (/[A-Za-z0-9\u4e00-\u9fff]/.test(first)) {
    return { emoji: "", label: name, hasEmojiPrefix: false };
  }

  return { emoji: first, label: rest, hasEmojiPrefix: true };
}

export function resolveProxyGroupModuleName(
  module: { emoji: string; name: string },
  override?: string
): string {
  const raw = typeof override === "string" ? override.trim() : "";
  if (!raw) return module.name;

  const parsed = splitLeadingEmoji(raw);
  if (parsed.hasEmojiPrefix) return raw;

  return `${module.emoji} ${raw}`.trim();
}

export function normalizeGroupNameWithDefaultEmoji(
  raw: string,
  defaultEmoji: string
): { full: string; emoji: string } {
  const name = typeof raw === "string" ? raw.trim() : "";
  const fallbackEmoji = typeof defaultEmoji === "string" && defaultEmoji.trim() ? defaultEmoji.trim() : "🧩";
  if (!name) return { full: "", emoji: fallbackEmoji };

  const parsed = splitLeadingEmoji(name);
  if (parsed.hasEmojiPrefix) return { full: name, emoji: parsed.emoji || fallbackEmoji };

  return { full: `${fallbackEmoji} ${name}`.trim(), emoji: fallbackEmoji };
}

