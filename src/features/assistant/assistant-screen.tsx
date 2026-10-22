"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Check, CircleSlash, KeyRound, Loader2, MessageSquarePlus, Search, Send, Settings2, Sparkles, Sunrise, X } from "lucide-react";
import { ConfirmDelete } from "@/components/data/confirm-delete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { formatTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { decideProposal, deleteConversation, sendMessage, writeBriefing } from "@/server/actions/assistant";
import type { AssistantWorkspace, ChatItem, ProposalView } from "@/server/assistant";
import { useServerAction } from "@/features/dashboard/use-server-action";
import { Markdown } from "./markdown";
import { MODELS, modelLabel } from "./models";

const STARTERS = ["What's due today and what's overdue?", "Help me plan this week.", "Which habits am I keeping up?", "How did last week go?"];

export function AssistantScreen({ ws }: { ws: AssistantWorkspace }) {
  if (ws.demo) return <Notice icon={CircleSlash} title="Not available in demo mode">The assistant needs your own database and an Anthropic API key. In demo mode nothing is sent anywhere.</Notice>;
  if (!ws.configured) return <SetupSteps />;
  if (!ws.settings.enabled) {
    return (
      <Notice icon={Sparkles} title="The assistant is switched off" action={<Button size="sm" asChild><Link href="/settings#assistant"><Settings2 /> Choose what it may read</Link></Button>}>
        Turn it on and pick the areas it may read. Each area is off until you switch it on; health, money and journal entries each need their own switch.
      </Notice>
    );
  }
  return <Chat ws={ws} />;
}

function Notice({ icon: Icon, title, children, action }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="grid max-w-2xl gap-3 p-6">
      <h2 className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-muted-foreground" aria-hidden /> {title}</h2>
      <p className="text-[13px] text-muted-foreground">{children}</p>
      {action && <div>{action}</div>}
    </Card>
  );
}

function SetupSteps() {
  return (
    <Card className="grid max-w-2xl gap-4 p-6">
      <h2 className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4 text-muted-foreground" aria-hidden /> Not connected yet</h2>
      <p className="text-[13px] text-muted-foreground">The server has no Anthropic API key, so nothing is sent to an AI provider. To connect it:</p>
      <ol className="grid list-decimal gap-2 pl-5 text-[13px]">
        <li>Create an account at <span className="font-medium">console.anthropic.com</span>, add a payment method and set a monthly spend limit there.</li>
        <li>Create an API key.</li>
        <li>Add it to the server environment as <code className="rounded bg-muted px-1 py-0.5 text-[12px]">ANTHROPIC_API_KEY</code> (in <code className="rounded bg-muted px-1 py-0.5 text-[12px]">.env.local</code> or your host&apos;s settings), then restart the app.</li>
        <li>Come back here and choose what it may read in Settings.</li>
      </ol>
      <p className="text-[11px] text-muted-foreground">The key stays on the server. It is never sent to your browser, and the assistant never gets database access: it can only use the read tools for the areas you share.</p>
    </Card>
  );
}

function Chat({ ws }: { ws: AssistantWorkspace }) {
  const router = useRouter();
  const { run, pending } = useServerAction();
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const items = ws.active?.items ?? [];
  const budgetLeft = ws.spend ? ws.settings.monthlyBudgetUsd - ws.spend.usd : null;

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [items.length, sent]);

  const send = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    setSent(t);
    setDraft("");
    run(() => sendMessage({ conversationId: ws.active?.id ?? null, text: t }), {
      quiet: true,
      onSuccess: (r) => { setSent(null); if (!ws.active && r.data) router.replace(`/assistant?c=${r.data.conversationId}`, { scroll: false }); },
      onError: () => { setSent(null); if (!ws.active) setDraft(t); },
    });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="grid content-start gap-2 max-lg:order-2">
        <Button size="sm" variant="outline" className="justify-start" asChild><Link href="/assistant"><MessageSquarePlus /> New conversation</Link></Button>
        {ws.conversations.length > 0 && (
          <nav aria-label="Conversations" className="grid gap-0.5">
            {ws.conversations.map((c) => (
              <div key={c.id} className={cn("group flex items-center rounded-md", ws.active?.id === c.id && "bg-muted")}>
                <Link href={`/assistant?c=${c.id}`} className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-[13px]" aria-current={ws.active?.id === c.id ? "page" : undefined}>{c.title}</Link>
                <span className="pointer-fine:opacity-0 pointer-fine:group-focus-within:opacity-100 pointer-fine:group-hover:opacity-100">
                  <ConfirmDelete size="icon-sm" label={`Delete conversation “${c.title}”`} title="Delete this conversation?" description="Its messages and suggestions are deleted. Anything you already confirmed stays."
                    onConfirm={() => run(() => deleteConversation(c.id), { onSuccess: () => { if (ws.active?.id === c.id) router.replace("/assistant"); } })} />
                </span>
              </div>
            ))}
          </nav>
        )}
        <p className="px-1 pt-2 text-[11px] text-muted-foreground">
          {ws.spend ? <>This month: about ${ws.spend.usd < 0.01 && ws.spend.usd > 0 ? "<0.01" : ws.spend.usd.toFixed(2)} of your ${ws.settings.monthlyBudgetUsd.toFixed(2)} budget. An estimate from token counts; Anthropic&apos;s invoice is the real figure.</> : null}
        </p>
      </aside>

      <div className="grid min-w-0 content-start gap-4">
        <Briefing ws={ws} />
        <Card className="grid min-h-[22rem] grid-rows-[1fr_auto]">
          <div className="grid content-start gap-4 p-4 sm:p-5" aria-live="polite">
            {items.length === 0 && !sent && (
              <div className="grid gap-3 py-6">
                <p className="text-[13px] text-muted-foreground">Ask about anything you&apos;ve shared. Answers link to your records, and any change it suggests waits for you to confirm.</p>
                <div className="flex flex-wrap gap-2">
                  {STARTERS.map((s) => <Button key={s} size="sm" variant="outline" disabled={pending} onClick={() => send(s)}>{s}</Button>)}
                </div>
              </div>
            )}
            {items.map((it) => (it.kind === "user" ? <UserBubble key={it.id} text={it.text} /> : <Reply key={it.id} item={it} ws={ws} />))}
            {sent && <UserBubble text={sent} />}
            {pending && sent && <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Looking through your records…</p>}
            <div ref={end} />
          </div>
          <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
            <Textarea aria-label="Message the assistant" value={draft} maxLength={4000} rows={2} placeholder={budgetLeft !== null && budgetLeft <= 0 ? "This month's budget is used up" : "Ask about your tasks, week, habits…"}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }}
              className="min-h-10 resize-none" />
            <Button type="submit" size="icon" aria-label="Send" disabled={pending || !draft.trim()}><Send /></Button>
          </form>
        </Card>
        <p className="text-[11px] text-muted-foreground">
          Answers come from {MODELS[ws.settings.model].label} via Anthropic and can be wrong; check the linked records before relying on them. Only the areas you share in <Link href="/settings#assistant" className="underline underline-offset-2">Settings</Link> are sent, and only when you ask.
        </p>
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return <div className="ml-auto max-w-[85%] rounded-lg bg-muted px-3 py-2 text-[13px] whitespace-pre-wrap">{text}</div>;
}

function Reply({ item, ws }: { item: Extract<ChatItem, { kind: "assistant" }>; ws: AssistantWorkspace }) {
  return (
    <div className="grid max-w-[95%] gap-2">
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Sparkles className="size-3" aria-hidden /> Assistant · {modelLabel(item.model)} · {formatTime(item.at, ws.timezone, ws.locale)}
      </span>
      {item.reads.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What it looked at">
          {item.reads.map((r, k) => (
            <li key={k} className={cn("flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground", !r.ok && "border-dashed")}>
              <Search className="size-3" aria-hidden /> {r.summary}
            </li>
          ))}
        </ul>
      )}
      {item.text ? <Markdown text={item.text} /> : item.proposals.length === 0 && <p className="text-[13px] text-muted-foreground">No answer was written.</p>}
      {item.proposals.map((p) => <ProposalCard key={p.id} p={p} />)}
    </div>
  );
}

const STATUS: Record<ProposalView["status"], { label: string; variant: "brand" | "success" | "outline" | "danger" }> = {
  pending_confirmation: { label: "Waiting for you", variant: "brand" },
  confirmed: { label: "Confirmed", variant: "success" },
  rejected: { label: "Declined", variant: "outline" },
  expired: { label: "Expired", variant: "outline" },
  failed: { label: "Couldn't apply", variant: "danger" },
};

function ProposalCard({ p }: { p: ProposalView }) {
  const { run, pending } = useServerAction();
  const s = STATUS[p.status];
  return (
    <div className={cn("grid gap-2 rounded-md border p-3", p.status === "pending_confirmation" ? "border-brand/40 bg-brand/5" : "border-border")}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-muted-foreground">Suggested change</span>
        <Badge variant={s.variant}>{s.label}</Badge>
      </div>
      <p className="text-[13px] font-medium">{p.summary}</p>
      {p.error && p.status === "failed" && <p className="text-[12px] text-destructive">{p.error}</p>}
      {p.status === "pending_confirmation" ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={pending} onClick={() => run(() => decideProposal(p.id, "confirm"))}><Check /> Confirm</Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideProposal(p.id, "reject"))}><X /> Decline</Button>
        </div>
      ) : p.status === "confirmed" && p.link ? (
        <Link href={p.link} className="text-[12px] underline underline-offset-2">Open it</Link>
      ) : null}
    </div>
  );
}

function Briefing({ ws }: { ws: AssistantWorkspace }) {
  const { run, pending } = useServerAction();
  const b = ws.briefing;
  return (
    <Card className="grid gap-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Sunrise className="size-4 text-muted-foreground" aria-hidden />
        <h2 className="text-[13px] font-medium">Today&apos;s briefing</h2>
        <Button size="sm" variant="ghost" className="ml-auto" disabled={pending} onClick={() => run(() => writeBriefing())}>
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {b ? "Rewrite" : "Write it"}
        </Button>
      </div>
      {b ? (
        <>
          <Markdown text={b.content} />
          <p className="text-[11px] text-muted-foreground">Written by {modelLabel(b.model)} at {formatTime(b.at, ws.timezone, ws.locale)} from your records. Suggestions are the assistant&apos;s, not facts.</p>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">Nothing written yet today. It only runs when you ask, so it never costs anything on its own.</p>
      )}
    </Card>
  );
}
