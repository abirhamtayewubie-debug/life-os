"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

/** A Delete button that always asks first and says what will be lost. */
export function ConfirmDelete({
  title, description, confirmLabel = "Delete", onConfirm, disabled, size = "sm", label = "Delete",
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  disabled?: boolean;
  /** "icon-sm" shows only the bin icon, with `label` as its accessible name. */
  size?: "sm" | "xs" | "icon-sm";
  label?: string;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {size === "icon-sm" ? (
          <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label={label} className="size-6 text-muted-foreground hover:text-destructive"><Trash2 /></Button>
        ) : (
          <Button type="button" variant="ghost" size={size} disabled={disabled} className="text-destructive hover:text-destructive"><Trash2 /> {label}</Button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{confirmLabel}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
