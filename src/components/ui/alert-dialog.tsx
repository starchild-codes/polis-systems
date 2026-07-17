import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function AlertDialog({ open, onOpenChange, children }: AlertDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-[1px] animate-fade-in motion-reduce:animate-none" onClick={() => onOpenChange(false)} />
      <div role="alertdialog" aria-modal="true" className="relative z-10 w-full max-w-md rounded-2xl border border-border/90 bg-background p-6 shadow-floating animate-pop-in motion-reduce:animate-none">
        {children}
      </div>
    </div>
  );
}

export function AlertDialogHeader({ children }: { children: ReactNode }) {
  return <div className="space-y-2">{children}</div>;
}

export function AlertDialogTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold text-foreground">{children}</h2>;
}

export function AlertDialogDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function AlertDialogFooter({ children }: { children: ReactNode }) {
  return <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4">{children}</div>;
}

export function AlertDialogContent({ children }: { children: ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}

export function AlertDialogCancel({
  onClick,
  children,
}: {
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="focus-ring inline-flex h-10 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}

export function AlertDialogAction({
  onClick,
  className,
  disabled,
  children,
}: {
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}
