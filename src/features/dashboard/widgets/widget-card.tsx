"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ProvenanceBadge } from "@/components/data/provenance";
import type { DataSource } from "../types";
import { cn } from "@/lib/utils";

export function WidgetCard({
  title,
  description,
  href,
  hrefLabel = "Open",
  source,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: React.ReactNode;
  href?: string;
  hrefLabel?: string;
  source?: DataSource | null;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <CardTitle>{title}</CardTitle>
            {source && <ProvenanceBadge source={source} />}
          </div>
          {description && <CardDescription className="mt-0.5">{description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {href && (
            <Link href={href} className="-my-1 inline-flex h-8 items-center gap-0.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
              {hrefLabel}
              <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className={cn("flex-1", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
