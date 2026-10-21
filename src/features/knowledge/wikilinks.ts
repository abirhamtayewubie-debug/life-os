/** `[[Title]]` links between notes. Titles match case-insensitively. */
const LINK = /\[\[([^[\]\n]{1,300})\]\]/g;

export const titleKey = (t: string) => t.trim().toLowerCase();

/** Unique link titles in a body, in order of first appearance. */
export function extractWikilinks(body: string): string[] {
  const seen = new Map<string, string>();
  for (const m of body.matchAll(LINK)) {
    const t = m[1].trim();
    if (t && !seen.has(titleKey(t))) seen.set(titleKey(t), t);
  }
  return [...seen.values()];
}

/** Splits a body into plain text and link segments for rendering. */
export function segments(body: string): ({ text: string } | { link: string })[] {
  const out: ({ text: string } | { link: string })[] = [];
  let last = 0;
  for (const m of body.matchAll(LINK)) {
    if (!m[1].trim()) continue;
    if (m.index > last) out.push({ text: body.slice(last, m.index) });
    out.push({ link: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/**
 * Maps link titles to note ids. When two notes share a title, the most
 * recently updated one wins (the index is expected newest first).
 */
export function resolveTitles(titles: string[], index: { id: string; title: string }[], selfId?: string) {
  const byKey = new Map<string, string>();
  for (const n of index) if (!byKey.has(titleKey(n.title))) byKey.set(titleKey(n.title), n.id);
  const resolved: string[] = [];
  const missing: string[] = [];
  for (const t of titles) {
    const id = byKey.get(titleKey(t));
    if (id && id !== selfId) resolved.push(id);
    else if (!id) missing.push(t);
  }
  return { resolved: [...new Set(resolved)], missing };
}

/** Normalises free-typed tags: trimmed, de-duplicated case-insensitively, max 40 chars. */
export function parseTags(input: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of input.split(",")) {
    const t = raw.trim().replace(/^#/, "").slice(0, 40);
    if (t && !seen.has(t.toLowerCase())) seen.set(t.toLowerCase(), t);
  }
  return [...seen.values()].slice(0, 20);
}
