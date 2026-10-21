import { FlaskConical, Pencil, Upload, Watch, Plug, Calculator, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { DataSource } from "@/features/dashboard/types";

const META: Record<DataSource, { label: string; title: string; icon: typeof Pencil; variant: "sample" | "outline" | "brand" }> = {
  sample: { label: "Sample", title: "Demo data, not yours. Remove it any time in Settings.", icon: FlaskConical, variant: "sample" },
  manual: { label: "Manual", title: "Entered by you", icon: Pencil, variant: "outline" },
  imported: { label: "Imported", title: "Imported from a file", icon: Upload, variant: "outline" },
  device: { label: "Device", title: "Recorded by a device or health platform", icon: Watch, variant: "outline" },
  integration: { label: "Synced", title: "Synced from a connected service", icon: Plug, variant: "outline" },
  estimate: { label: "Estimate", title: "Derived or projected, not measured", icon: Calculator, variant: "outline" },
  ai_suggested: { label: "AI-suggested", title: "Proposed by the assistant and confirmed by you", icon: Sparkles, variant: "brand" },
};

/** Shows where a piece of data came from. Manual data is shown only when `showManual`. */
export function ProvenanceBadge({ source, showManual = false }: { source: DataSource; showManual?: boolean }) {
  if (source === "manual" && !showManual) return null;
  const m = META[source];
  return (
    <Badge variant={m.variant} title={m.title}>
      <m.icon aria-hidden />
      {m.label}
    </Badge>
  );
}
