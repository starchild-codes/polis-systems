import {
  createContext, useContext, useState, useRef, useEffect, useLayoutEffect,
  type CSSProperties, type KeyboardEvent, type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLSpanElement>;
  contentRef: React.RefObject<HTMLDivElement>;
  focusFirstRef: React.MutableRefObject<boolean>;
}

const DropdownCtx = createContext<DropdownContextValue | null>(null);

function useDropdown() {
  const context = useContext(DropdownCtx);
  if (!context) throw new Error("Dropdown menu components must be used inside DropdownMenu");
  return context;
}

export function DropdownMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const focusFirstRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !contentRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <DropdownCtx.Provider value={{ open, setOpen, triggerRef, contentRef, focusFirstRef }}>
        {children}
      </DropdownCtx.Provider>
    </span>
  );
}

export function DropdownMenuTrigger({ asChild, children }: { asChild?: boolean; children: ReactNode }) {
  const { open, setOpen, triggerRef, focusFirstRef } = useDropdown();

  function handleKeyDown(event: KeyboardEvent<HTMLSpanElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusFirstRef.current = true;
      setOpen(true);
    }
  }

  if (asChild) {
    return (
      <span
        ref={triggerRef}
        className="inline-flex"
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={handleKeyDown}
        onClick={() => { focusFirstRef.current = true; setOpen(!open); }}
      >
        {children}
      </span>
    );
  }

  return (
    <span ref={triggerRef} className="inline-flex">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={(event) => handleKeyDown(event as unknown as KeyboardEvent<HTMLSpanElement>)}
        onClick={() => { focusFirstRef.current = true; setOpen(!open); }}
      >
        {children}
      </button>
    </span>
  );
}

export function DropdownMenuContent({
  align = "start", className, children,
}: { align?: "start" | "end"; className?: string; children: ReactNode }) {
  const { open, setOpen, triggerRef, contentRef, focusFirstRef } = useDropdown();
  // Measure the menu as a fixed, shrink-to-fit surface. Measuring it as a
  // normal block makes an un-sized menu span the body and clamps right-aligned
  // menus to the left viewport edge.
  const [position, setPosition] = useState<CSSProperties>({ position: "fixed", top: 0, left: 0, visibility: "hidden" });

  useLayoutEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const content = contentRef.current;
      if (!trigger || !content) return;
      const triggerRect = trigger.getBoundingClientRect();
      const contentRect = content.getBoundingClientRect();
      const margin = 8;
      const offset = 6;
      const spaceBelow = window.innerHeight - triggerRect.bottom - margin;
      const openAbove = contentRect.height > spaceBelow && triggerRect.top > spaceBelow;
      const top = openAbove
        ? Math.max(margin, triggerRect.top - contentRect.height - offset)
        : Math.min(window.innerHeight - contentRect.height - margin, triggerRect.bottom + offset);
      const preferredLeft = align === "end" ? triggerRect.right - contentRect.width : triggerRect.left;
      const left = Math.min(
        Math.max(margin, preferredLeft),
        Math.max(margin, window.innerWidth - contentRect.width - margin),
      );
      setPosition({ position: "fixed", top, left, visibility: "visible" });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, align, triggerRef, contentRef]);

  useEffect(() => {
    if (!open || !focusFirstRef.current) return;
    focusFirstRef.current = false;
    requestAnimationFrame(() => contentRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }, [open, contentRef, focusFirstRef]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(contentRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(current + 1 + items.length) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(current - 1 + items.length) % items.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  }

  return createPortal(
    <div
      ref={contentRef}
      role="menu"
      style={position}
      onKeyDown={handleKeyDown}
      className={cn(
        "z-[100] min-w-[12rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-border/90 bg-popover p-1.5 text-popover-foreground shadow-floating animate-pop-in",
        "max-h-[min(20rem,calc(100vh-1rem))]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export function DropdownMenuItem({
  className, onClick, children,
}: { className?: string; onClick?: () => void; children: ReactNode }) {
  const { setOpen, triggerRef } = useDropdown();
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.();
          setOpen(false);
          requestAnimationFrame(() => triggerRef.current?.querySelector<HTMLElement>("button, [tabindex]")?.focus());
        }
      }}
      onClick={() => { onClick?.(); setOpen(false); }}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none transition-[color,background-color,transform] duration-150",
        "hover:translate-x-0.5 hover:bg-accent focus:bg-accent focus:text-accent-foreground motion-reduce:transform-none",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}
