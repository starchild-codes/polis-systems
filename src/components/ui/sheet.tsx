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
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px] animate-fade-in motion-reduce:animate-none"
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
        "absolute inset-y-0 right-0 flex h-full w-full flex-col border-l border-border/90 bg-background shadow-floating animate-slide-in-right motion-reduce:animate-none sm:max-w-lg",
        className,
      )}
    >
      {onOpenChange && (
        <button
          onClick={() => onOpenChange(false)}
          aria-label="Close panel"
          className="focus-ring absolute right-4 top-4 z-10 rounded-lg border border-transparent p-1.5 text-muted-foreground transition-[color,background-color,border-color,transform] hover:scale-105 hover:border-border hover:bg-background hover:text-foreground motion-reduce:transform-none"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

export function SheetHeader({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("border-b border-border/80 bg-muted/[0.28] px-5 py-5 sm:px-6", className)}>{children}</div>;
}

export function SheetTitle({ className, children }: { className?: string; children: ReactNode }) {
  return <h2 className={cn("text-lg font-semibold text-foreground", className)}>{children}</h2>;
}

export function SheetDescription({ className, children }: { className?: string; children: ReactNode }) {
  return <p className={cn("text-sm text-muted-foreground", className)}>{children}</p>;
}

export function SheetBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex-1 overflow-y-auto px-5 py-5 sm:px-6", className)}>{children}</div>;
}

export function SheetFooter({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex items-center justify-end gap-2 border-t border-border/80 bg-background/95 px-5 py-4 shadow-[0_-8px_24px_hsl(222_47%_11%/0.035)] backdrop-blur-sm sm:px-6", className)}>
      {children}
    </div>
  );
}
