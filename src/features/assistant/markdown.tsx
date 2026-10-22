import Link from "next/link";
import { Fragment } from "react";

/**
 * A deliberately small Markdown subset for assistant text: paragraphs,
 * headings, lists, bold, italics, inline code and links. It builds React
 * elements (never HTML), and only in-app links ("/…") become clickable, so
 * text from the model can't inject markup or send the person elsewhere.
 */

export function isInternalHref(href: string): boolean {
  return /^\/(?!\/)[\w\-./?=&%#:@+~]*$/.test(href);
}

type Inline = string | { b: Inline[] } | { i: Inline[] } | { code: string } | { link: string; text: Inline[] };

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    if (m[1] !== undefined) out.push({ b: parseInline(m[1]) });
    else if (m[2] !== undefined) out.push({ i: parseInline(m[2]) });
    else if (m[3] !== undefined) out.push({ code: m[3] });
    else out.push(isInternalHref(m[5]) ? { link: m[5], text: parseInline(m[4]) } : `${m[4]}`);
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((n, k) => {
    if (typeof n === "string") return <Fragment key={k}>{n}</Fragment>;
    if ("b" in n) return <strong key={k} className="font-semibold">{renderInline(n.b)}</strong>;
    if ("i" in n) return <em key={k}>{renderInline(n.i)}</em>;
    if ("code" in n) return <code key={k} className="rounded bg-muted px-1 py-0.5 text-[12px]">{n.code}</code>;
    return <Link key={k} href={n.link} className="text-foreground underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground">{renderInline(n.text)}</Link>;
  });
}

type Block = { kind: "p"; text: string } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

export function parseBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of src.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const last = blocks[blocks.length - 1];
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const head = /^#{1,6}\s+(.*)$/.exec(line);
    if (!line.trim()) { blocks.push({ kind: "p", text: "" }); continue; }
    if (head) blocks.push({ kind: "h", text: head[1] });
    else if (bullet) { if (last?.kind === "ul") last.items.push(bullet[1]); else blocks.push({ kind: "ul", items: [bullet[1]] }); }
    else if (num) { if (last?.kind === "ol") last.items.push(num[1]); else blocks.push({ kind: "ol", items: [num[1]] }); }
    else if (last?.kind === "p" && last.text) last.text += `\n${line}`;
    else blocks.push({ kind: "p", text: line });
  }
  return blocks.filter((b) => !(b.kind === "p" && !b.text));
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="grid gap-2 text-[13px] leading-relaxed">
      {parseBlocks(text).map((b, k) => {
        if (b.kind === "h") return <p key={k} className="pt-1 font-semibold">{renderInline(parseInline(b.text))}</p>;
        if (b.kind === "ul") return <ul key={k} className="grid list-disc gap-1 pl-5">{b.items.map((t, j) => <li key={j}>{renderInline(parseInline(t))}</li>)}</ul>;
        if (b.kind === "ol") return <ol key={k} className="grid list-decimal gap-1 pl-5">{b.items.map((t, j) => <li key={j}>{renderInline(parseInline(t))}</li>)}</ol>;
        return <p key={k} className="whitespace-pre-line">{renderInline(parseInline(b.text))}</p>;
      })}
    </div>
  );
}
