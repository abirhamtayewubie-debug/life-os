import { PageHeader } from "@/components/shell/page-header";
import { FinanceScreen } from "@/features/finance/finance-screen";
import type { FinanceTab } from "@/features/finance/shared";
import { getFinanceWorkspace } from "@/server/finance";

export const metadata = { title: "Finance" };

// Mirrors TABS in shared.tsx (a client module, so it can't be read here).
const VALID = new Set<string>(["overview", "transactions", "budgets", "bills", "savings", "loans", "report", "setup"] satisfies FinanceTab[]);

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const sp = await searchParams;
  const ws = await getFinanceWorkspace(sp);
  const tab = (typeof sp.tab === "string" && VALID.has(sp.tab) ? sp.tab : "overview") as FinanceTab;
  return (
    <div className="animate-rise">
      <PageHeader title="Finance" description="Accounts, spending, budgets, bills and loans, in each currency you use. Nothing is converted without your own rate." />
      <FinanceScreen ws={ws} tab={tab} startNew={sp.new === "1"} />
    </div>
  );
}
