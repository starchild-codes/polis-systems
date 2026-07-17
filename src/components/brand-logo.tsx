import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  decorative?: boolean;
  eager?: boolean;
};

export function BrandLogo({ className, decorative = false, eager = false }: BrandLogoProps) {
  return (
    <img
      src="/polis-logo.svg"
      alt={decorative ? "" : "Polis Systems"}
      aria-hidden={decorative || undefined}
      className={cn("shrink-0 rounded-full object-cover", className)}
      draggable={false}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
