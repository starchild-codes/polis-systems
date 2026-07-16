import { useState, useRef, useEffect, createContext, useContext, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

const SelectContext = createContext<{
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  selectedLabel: string;
  setSelectedLabel: (l: string) => void;
} | null>(null);

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}

export function Select({ value, onValueChange, children, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, selectedLabel, setSelectedLabel }}>
      <div ref={ref} className={cn("relative inline-block w-full", className)}>
        {children}
      </div>
    </SelectContext.Provider>
  );
}

export function SelectTrigger({ className, children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectTrigger must be inside Select");
  return (
    <button
      type="button"
      onClick={() => ctx.setOpen(!ctx.open)}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown className="ml-auto h-4 w-4 shrink-0 opacity-50" />
    </button>
  );
}

export function SelectValue({ placeholder }: { placeholder?: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectValue must be inside Select");
  return (
    <span className={cn("flex-1 truncate text-left", !ctx.value && "text-muted-foreground")}>
      {ctx.selectedLabel || placeholder || "Select..."}
    </span>
  );
}

export function SelectContent({ children, className }: { children: ReactNode; className?: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectContent must be inside Select");
  if (!ctx.open) return null;
  return (
    <div className={cn(
      "absolute top-full left-0 z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md scrollbar-thin",
      className,
    )}>
      {children}
    </div>
  );
}

export function SelectItem({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectItem must be inside Select");
  const isSelected = ctx.value === value;
  return (
    <div
      onClick={() => {
        ctx.onValueChange(value);
        ctx.setSelectedLabel(typeof children === "string" ? children : String(children));
        ctx.setOpen(false);
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent",
        className,
      )}
    >
      {isSelected && <Check className="absolute left-2 h-3.5 w-3.5" />}
      {children}
    </div>
  );
}
