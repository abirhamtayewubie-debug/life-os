import { ScreenHeader } from "@/components/shell/screen-header";
import { HabitsScreen } from "@/features/habits/habits-screen";
import { getHabitWorkspace } from "@/server/habits";

export const metadata = { title: "Habits" };

export default async function HabitsPage({ searchParams }: PageProps<"/habits">) {
  const sp = await searchParams;
  const ws = await getHabitWorkspace(new Date());
  return (
    <div className="animate-rise">
      <ScreenHeader title="Small" accent="habits" accentTone="sage" phoneTitle="Habits" root description="The little things, done regularly. Tap a day to log it; pause a habit when life gets in the way." />
      <HabitsScreen ws={ws} startNew={sp.new === "1"} />
    </div>
  );
}
