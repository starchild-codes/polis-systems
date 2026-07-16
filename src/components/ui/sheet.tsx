import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

export function Sheet({ open, onOpenChange, children }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40 animate-in fade-in-0 duration-200"
        onClick={() => onOpenChange(false)}
      />
      {children}
    </div>
  );
}

interface SheetContentProps {
  side?: "right";
  className?: string;
  children: ReactNode;
  onOpenChange?: (open: boolean) => void;
}

export function SheetContent({ className, children, onOpenChange }: SheetContentProps) {
  return (
    <div
      className={cn(
        "absolute inset-y-0 right-0 flex h-full w-full flex-col bg-background shadow-xl animate-in slide-in-from-right duration-300 sm:max-w-lg",
        className,
      )}
    >
      {onOpenChange && (
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 z-10 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

export function SheetHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("border-b border-border px-6 py-4", className)}>{children}</div>;
}

export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)}>{children}</h2>;
}

export function SheetDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function SheetBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex-1 overflow-y-auto px-6 py-4", className)}>{children}</div>;
}

export function SheetFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-border px-6 py-4", className)}>
      {children}
    </div>
  );
}
