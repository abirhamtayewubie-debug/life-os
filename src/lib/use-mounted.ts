"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** true after hydration; false during SSR. Avoids theme-dependent hydration mismatches. */
export function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
