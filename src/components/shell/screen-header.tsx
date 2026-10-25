import { DetailHeader } from "@/components/clay/detail-header";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";

/**
 * Detail page header: back · title · more on phones, the Fraunces title with an
 * italic accent on tablets and desktop. Actions render once and stay reachable
 * on phones as a row under the bar. Pages using it are listed in the top bar's
 * OWN_PHONE_HEADER so the phone doesn't show two bars.
 */
export function ScreenHeader({ title, accent, accentTone, phoneTitle, description, actions, eyebrow, root = false }: {
  title: string;
  accent?: string;
  accentTone?: "clay" | "sage";
  phoneTitle: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  /** A bottom-nav page (Plan, Habits): no back button, the big title shows on phones too. */
  root?: boolean;
}) {
  if (root) {
    return <PageHeader title={title} accent={accent} accentTone={accentTone} description={description} eyebrow={eyebrow} actions={actions} className="max-md:mb-6 max-md:pt-0" />;
  }
  return (
    <>
      <DetailHeader title={phoneTitle} />
      <PageHeader
        title={title}
        accent={accent}
        accentTone={accentTone}
        description={description}
        eyebrow={eyebrow}
        actions={actions}
        className={cn("max-md:mb-5 max-md:pt-0", !actions && "max-md:hidden")}
        titleClassName="max-md:hidden"
      />
    </>
  );
}
