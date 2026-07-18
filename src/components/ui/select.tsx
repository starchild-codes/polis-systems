import { useState, useRef, useEffect, useLayoutEffect, createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";

const SelectContext = createContext<{
  value: string;
  onValueChange: (v: string) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  selectedLabel: string;
  selectValue: (value: string, label: string) => void;
  triggerRef: React.RefObject<HTMLDivElement>;
  contentRef: React.RefObject<HTMLDivElement>;
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
  const selectedValueRef = useRef(value);
  const triggerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // A parent clearing a controlled Select must also clear the label rendered
  // by this component. Selections made through SelectItem set the ref first,
  // so their label remains visible.
  useEffect(() => {
    if (selectedValueRef.current !== value) {
      selectedValueRef.current = value;
      setSelectedLabel("");
    }
  }, [value]);

  const selectValue = (nextValue: string, label: string) => {
    selectedValueRef.current = nextValue;
    setSelectedLabel(label);
    onValueChange(nextValue);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, selectedLabel, selectValue, triggerRef, contentRef }}>
      <div ref={triggerRef} className={cn("relative inline-block w-full", className)}>
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
      aria-haspopup="listbox"
      aria-expanded={ctx.open}
      className={cn(
        "flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm shadow-sm shadow-slate-950/[0.02] transition-[border-color,box-shadow,background-color] hover:border-primary/25 hover:bg-accent/40 focus-visible:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20",
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
  const [position, setPosition] = useState<CSSProperties>({ visibility: "hidden" });

  useLayoutEffect(() => {
    if (!ctx.open) return;

    const updatePosition = () => {
      const trigger = ctx.triggerRef.current;
      const content = ctx.contentRef.current;
      if (!trigger || !content) return;
      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const margin = 8;
      const offset = 6;
      const width = Math.min(Math.max(triggerRect.width, 176), window.innerWidth - margin * 2);
      const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
      const openAbove = contentRect.height > spaceBelow && triggerRect.top > spaceBelow;
      const top = openAbove
        ? Math.max(margin, triggerRect.top - contentRect.height - offset)
        : Math.min(window.innerHeight - contentRect.height - margin, triggerRect.bottom + offset);
      const left = Math.min(Math.max(margin, triggerRect.left), window.innerWidth - width - margin);
      setPosition({ position: "fixed", top, left, width, visibility: "visible" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [ctx.open, ctx.triggerRef, ctx.contentRef]);

  if (!ctx.open) return null;
  return createPortal(
    <div className={cn(
      "z-[100] max-h-[min(15rem,calc(100vh-1rem))] overflow-auto rounded-xl border border-border/90 bg-popover p-1.5 shadow-floating scrollbar-thin animate-pop-in motion-reduce:animate-none",
      className,
    )} ref={ctx.contentRef} style={position} role="listbox">
      {children}
    </div>,
    document.body,
  );
}

export function SelectItem({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const ctx = useContext(SelectContext);
  if (!ctx) throw new Error("SelectItem must be inside Select");
  const isSelected = ctx.value === value;
  return (
    <div
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      onClick={() => {
        ctx.selectValue(value, typeof children === "string" ? children : String(children));
        ctx.setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          ctx.selectValue(value, typeof children === "string" ? children : String(children));
          ctx.setOpen(false);
        }
      }}
      className={cn(
        "relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none transition-colors hover:bg-accent focus:bg-accent",
        className,
      )}
    >
      {isSelected && <Check className="absolute left-2 h-3.5 w-3.5" />}
      {children}
    </div>
  );
}
