"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeftRight, FileUp, Plus, Settings2 } from "lucide-react";
import { DetailHeader } from "@/components/clay/detail-header";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AccountForm, BudgetForm, CategoryForm, PaymentForm, RateForm, RecurringForm, SavingsForm, TransactionForm, TransferForm } from "./forms";
import { ImportPanel } from "./import-panel";
import { LoanForm, LoanPaymentForm, LoansTab } from "./loans";
import { Overview } from "./overview";
import { BillsTab, BudgetsTab, SavingsTab } from "./plans";
import { ReportTab } from "./report";
import { SetupTab } from "./setup";
import { FinanceContext, NavContext, TABS, type Editor, type FinanceTab } from "./shared";
import { TransactionsTab } from "./transactions";
import type { FinanceWorkspace } from "./types";

const TITLES: Record<Editor["k"], [string, string]> = {
  account: ["New account", "Edit account"],
  tx: ["New transaction", "Edit transaction"],
  transfer: ["Transfer between accounts", ""],
  category: ["New category", "Edit category"],
  budget: ["New budget", "Edit budget"],
  recurring: ["New bill or regular payment", "Edit bill or regular payment"],
  pay: ["Record payment", ""],
  rate: ["New exchange rate", "Edit exchange rate"],
  savings: ["New savings goal", "Edit savings goal"],
  import: ["Import a bank statement (CSV)", ""],
  loan: ["New personal loan", "Edit loan"],
  loanPay: ["Loan payment", ""],
};

export function FinanceScreen({ ws, tab, startNew = false }: { ws: FinanceWorkspace; tab: FinanceTab; startNew?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [editor, setEditor] = useState<Editor | null>(startNew ? (ws.accounts.some((a) => !a.archived_at) ? { k: "tx", x: null } : { k: "account", x: null }) : null);

  const go = (params: Record<string, string | null>) => {
    const q = new URLSearchParams(search.toString());
    q.delete("new");
    for (const [k, v] of Object.entries(params)) {
      if (v === null || v === "") q.delete(k);
      else q.set(k, v);
    }
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  const newTx: Editor = ws.accounts.some((a) => !a.archived_at) ? { k: "tx", x: null } : { k: "account", x: null };
  useEffect(() => {
    const onNew = () => setEditor(ws.accounts.some((a) => !a.archived_at) ? { k: "tx", x: null } : { k: "account", x: null });
    window.addEventListener("lifeos:new-transaction", onNew);
    return () => window.removeEventListener("lifeos:new-transaction", onNew);
  }, [ws.accounts]);

  const close = () => setEditor(null);
  const isEdit = editor && "x" in editor && editor.x !== null && editor.k !== "pay" && editor.k !== "loanPay";
  const title = editor?.k === "loanPay" ? `${editor.x.direction === "borrowed" ? "Borrowed from" : "Lent to"} ${editor.x.person_name}`
    : editor?.k === "loan" && !editor.x ? (editor.direction === "lent" ? "Money I lent" : "Money I borrowed")
    : editor ? TITLES[editor.k][isEdit ? 1 : 0] : "";

  return (
    <FinanceContext.Provider value={ws}>
      <NavContext.Provider value={{ open: setEditor, go }}>
        <DetailHeader
          title="Finance"
          actions={[
            { label: "New transaction", icon: Plus, onSelect: () => setEditor(newTx) },
            { label: "Transfer", icon: ArrowLeftRight, onSelect: () => setEditor({ k: "transfer" }) },
            { label: "Import a statement", icon: FileUp, onSelect: () => setEditor({ k: "import" }) },
            { label: "Accounts & setup", icon: Settings2, onSelect: () => go({ tab: "setup" }) },
          ]}
        />
        <PageHeader
          className="max-md:hidden"
          title="Your"
          accent="finances"
          description="Accounts, spending, budgets, bills and loans, in each currency you use. Nothing is converted without your own rate."
          actions={<>
            <Button variant="outline" className="h-11" onClick={() => setEditor({ k: "transfer" })}><ArrowLeftRight /> Transfer</Button>
            <Button className="h-11" onClick={() => setEditor(newTx)}><Plus /> Transaction</Button>
          </>}
        />
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
          <div className="-mx-5 overflow-x-auto px-5 pb-1 md:mx-0 md:px-0">
            <div role="tablist" aria-label="Finance views" className="flex w-max gap-1.5">
              {TABS.map((t) => (
                <button key={t.v} role="tab" aria-selected={tab === t.v} onClick={() => go({ tab: t.v === "overview" ? null : t.v })}
                  className={cn("h-10 cursor-pointer rounded-full border border-border px-4 text-[13px] whitespace-nowrap text-muted-foreground transition-colors hover:bg-tint-mist", tab === t.v && "border-transparent bg-primary text-primary-foreground hover:bg-primary")}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {tab === "overview" ? <Overview />
            : tab === "transactions" ? <TransactionsTab />
            : tab === "budgets" ? <BudgetsTab />
            : tab === "bills" ? <BillsTab />
            : tab === "savings" ? <SavingsTab />
            : tab === "loans" ? <LoansTab />
            : tab === "report" ? <ReportTab />
            : <SetupTab />}

          <Dialog open={!!editor} onOpenChange={(o) => !o && close()}>
            <DialogContent className={cn("max-w-xl", editor?.k === "import" && "max-w-3xl")}>
              <DialogHeader>
                <DialogTitle>{editor?.k === "pay" ? `${editor.x.amount.startsWith("-") ? "Record payment" : "Record income"}: ${editor.x.description}` : title}</DialogTitle>
                <DialogDescription className="sr-only">{title}</DialogDescription>
              </DialogHeader>
              {editor?.k === "account" && <AccountForm account={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "tx" && <TransactionForm tx={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "transfer" && <TransferForm onDone={close} onCancel={close} />}
              {editor?.k === "category" && <CategoryForm category={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "budget" && <BudgetForm budget={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "recurring" && <RecurringForm item={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "pay" && <PaymentForm item={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "rate" && <RateForm rate={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "savings" && <SavingsForm goal={editor.x} onDone={close} onCancel={close} />}
              {editor?.k === "loan" && <LoanForm loan={editor.x} direction={editor.direction} onDone={close} onCancel={close} />}
              {editor?.k === "loanPay" && <LoanPaymentForm loan={editor.x} kind={editor.kind} onDone={close} onCancel={close} />}
              {editor?.k === "import" && <ImportPanel onDone={close} onCancel={close} />}
            </DialogContent>
          </Dialog>
        </div>
      </NavContext.Provider>
    </FinanceContext.Provider>
  );
}
