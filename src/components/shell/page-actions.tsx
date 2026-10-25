"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Renders children into the desktop top bar, next to search and the bell. */
export function PageActions({ children }: { children: React.ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The slot lives in the layout's top bar, so it only exists after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById("page-actions"));
  }, []);
  return slot ? createPortal(children, slot) : null;
}
