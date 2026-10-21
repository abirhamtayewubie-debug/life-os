import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-3 w-40" />
      <Skeleton className="mt-2 h-7 w-64" />
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-6 xl:grid-cols-12">
        {["xl:col-span-8", "xl:col-span-4", "xl:col-span-6", "xl:col-span-6", "xl:col-span-4", "xl:col-span-8"].map((c, i) => (
          <Skeleton key={i} className={`h-56 rounded-xl md:col-span-3 ${c}`} />
        ))}
      </div>
    </div>
  );
}
