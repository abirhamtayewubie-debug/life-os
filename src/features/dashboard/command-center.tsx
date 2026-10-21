"use client";

import { useEffect, useMemo, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, LayoutGrid, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { APP_EVENTS } from "@/components/shell/command-palette";
import { cn } from "@/lib/utils";
import { resetDashboardLayout, saveDashboardLayout } from "@/server/actions/dashboard";
import type { DashboardModel } from "./compute";
import { EveningReview } from "./evening-review";
import { useServerAction } from "./use-server-action";
import { DEFAULT_LAYOUT, WIDGETS, normalizeLayout, type WidgetKey, type WidgetPref, type WidgetSize } from "./widgets";
import { AgendaWidget, BriefingWidget, DeadlinesWidget, PrioritiesWidget, RemindersWidget } from "./widgets/planning";
import { GoalsWidget, HabitsWidget, ProjectsWidget, WheelWidget } from "./widgets/progress";
import { SleepWidget, WellnessWidget } from "./widgets/wellbeing";
import { FinanceWidget } from "./widgets/money";
import { ChangesWidget, JournalWidget, SuggestionsWidget } from "./widgets/insights";

const SIZE_CLASS: Record<WidgetSize, string> = {
  sm: "md:col-span-3 xl:col-span-4",
  md: "md:col-span-3 xl:col-span-6",
  lg: "md:col-span-6 xl:col-span-8",
  full: "md:col-span-6 xl:col-span-12",
};
const SIZE_LABEL: Record<WidgetSize, string> = { sm: "S", md: "M", lg: "L", full: "Full" };
const LOCAL_KEY = "lifeos:demo-layout";

function renderWidget(key: WidgetKey, m: DashboardModel, locale: string) {
  switch (key) {
    case "briefing": return <BriefingWidget m={m} />;
    case "priorities": return <PrioritiesWidget m={m} />;
    case "agenda": return <AgendaWidget m={m} />;
    case "deadlines": return <DeadlinesWidget m={m} />;
    case "reminders": return <RemindersWidget m={m} />;
    case "habits": return <HabitsWidget m={m} />;
    case "goals": return <GoalsWidget m={m} />;
    case "projects": return <ProjectsWidget m={m} />;
    case "wheel": return <WheelWidget m={m} />;
    case "sleep": return <SleepWidget m={m} />;
    case "wellness": return <WellnessWidget m={m} />;
    case "finance": return <FinanceWidget m={m} locale={locale} />;
    case "changes": return <ChangesWidget m={m} />;
    case "suggestions": return <SuggestionsWidget m={m} />;
    case "journal": return <JournalWidget m={m} />;
  }
}

function SortableWidget({ pref, editing, onToggle, onSize, children }: {
  pref: WidgetPref; editing: boolean; onToggle: () => void; onSize: (s: WidgetSize) => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: pref.key, disabled: !editing });
  const def = WIDGETS.find((w) => w.key === pref.key)!;
  return (
    <section
      ref={setNodeRef}
      aria-label={def.title}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("col-span-1 min-w-0 animate-rise", SIZE_CLASS[pref.size], isDragging && "z-10 opacity-80", editing && "rounded-xl outline-1 outline-dashed outline-brand/40 outline-offset-4")}
    >
      {editing && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            className="flex h-7 cursor-grab items-center gap-1 rounded-md border border-border bg-surface px-1.5 text-xs text-muted-foreground active:cursor-grabbing"
            aria-label={`Move ${def.title}. Use space then arrow keys.`}
          >
            <GripVertical className="size-3.5" aria-hidden /> {def.title}
          </button>
          <div className="ml-auto flex items-center rounded-md border border-border bg-surface p-0.5" role="group" aria-label={`${def.title} size`}>
            {def.sizes.map((s) => (
              <button
                key={s}
                aria-pressed={pref.size === s}
                onClick={() => onSize(s)}
                className={cn("h-6 cursor-pointer rounded-sm px-2 text-[11px] text-muted-foreground", pref.size === s && "bg-muted font-medium text-foreground")}
              >
                {SIZE_LABEL[s]}
              </button>
            ))}
          </div>
          <Button variant="outline" size="xs" onClick={onToggle} aria-label={`Hide ${def.title}`}><EyeOff /> Hide</Button>
        </div>
      )}
      <div className={cn(editing && "pointer-events-none select-none")}>{children}</div>
    </section>
  );
}

export function CommandCenter({
  model, initialLayout, demo, locale, greeting, longDate,
}: { model: DashboardModel; initialLayout: WidgetPref[]; demo: boolean; locale: string; greeting: string; longDate: string }) {
  const [layout, setLayout] = useState(initialLayout);
  const [editing, setEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<WidgetPref[] | null>(null);
  const { pending, run } = useServerAction();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  // Demo mode keeps layout in this browser only.
  useEffect(() => {
    if (!demo) return;
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      // Syncing from browser storage after hydration is the intended use of an effect here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setLayout(normalizeLayout(JSON.parse(raw)));
    } catch { /* storage unavailable: keep defaults */ }
  }, [demo]);

  useEffect(() => {
    const onCustomize = () => startEditing();
    window.addEventListener(APP_EVENTS.customize, onCustomize);
    return () => window.removeEventListener(APP_EVENTS.customize, onCustomize);
  });

  const visible = useMemo(() => layout.filter((w) => w.visible), [layout]);
  const hidden = useMemo(() => layout.filter((w) => !w.visible), [layout]);

  function startEditing() {
    setSnapshot(layout);
    setEditing(true);
  }
  function cancel() {
    if (snapshot) setLayout(snapshot);
    setEditing(false);
  }
  function save() {
    if (demo) {
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(layout)); } catch { /* ignore */ }
      setEditing(false);
      toast.success("Layout saved in this browser.", { description: "In demo mode the layout is stored locally only." });
      return;
    }
    run(() => saveDashboardLayout(layout), { onSuccess: () => setEditing(false) });
  }
  function reset() {
    setLayout(DEFAULT_LAYOUT);
    if (demo) {
      try { localStorage.removeItem(LOCAL_KEY); } catch { /* ignore */ }
      return;
    }
    run(() => resetDashboardLayout(), { quiet: true });
  }
  const update = (key: WidgetKey, patch: Partial<WidgetPref>) => setLayout((l) => l.map((w) => (w.key === key ? { ...w, ...patch } : w)));
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setLayout((l) => arrayMove(l, l.findIndex((w) => w.key === active.id), l.findIndex((w) => w.key === over.id)));
  }

  const unfinishedHints = [...model.overdue, ...model.priorities].map((t) => t.title);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{longDate}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{greeting}</h1>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1"><dt>Open tasks</dt><dd className="tabular font-medium text-foreground">{model.stats.openTasks}</dd></div>
            <div className="flex gap-1"><dt>Done today</dt><dd className="tabular font-medium text-foreground">{model.stats.doneToday}</dd></div>
            <div className="flex gap-1"><dt>Events</dt><dd className="tabular font-medium text-foreground">{model.agenda.length}</dd></div>
            {model.stats.habitsScheduledToday > 0 && (
              <div className="flex gap-1"><dt>Habits</dt><dd className="tabular font-medium text-foreground">{model.stats.habitsDoneToday}/{model.stats.habitsScheduledToday}</dd></div>
            )}
          </dl>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={reset}><RotateCcw /> Reset</Button>
              <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={pending}>{pending ? "Saving…" : "Save layout"}</Button>
            </>
          ) : (
            <>
              <EveningReview existing={model.eveningReview} unfinishedHints={unfinishedHints} />
              <Button variant="outline" size="sm" onClick={startEditing}><LayoutGrid /> Customize</Button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="mb-5 rounded-xl border border-dashed border-border bg-surface-2/50 p-4 text-[13px] animate-fade-in">
          <p className="text-muted-foreground">Drag widgets to reorder, choose a size, or hide what you don&apos;t need.</p>
          {hidden.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Hidden:</span>
              {hidden.map((w) => (
                <Button key={w.key} variant="outline" size="xs" onClick={() => update(w.key, { visible: true })}>
                  <Eye /> {WIDGETS.find((d) => d.key === w.key)!.title}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={visible.map((w) => w.key)} strategy={rectSortingStrategy}>
          <div className="grid grid-flow-row-dense grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
            {visible.map((w) => (
              <SortableWidget key={w.key} pref={w} editing={editing} onToggle={() => update(w.key, { visible: false })} onSize={(size) => update(w.key, { size })}>
                {renderWidget(w.key, model, locale)}
              </SortableWidget>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!visible.length && (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          All widgets are hidden. Use <strong>Customize</strong> to bring some back.
        </div>
      )}
    </div>
  );
}
