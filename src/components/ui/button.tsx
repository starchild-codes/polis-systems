import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive" | "secondary";
type Size = "default" | "sm" | "icon";

const variantClasses: Record<Variant, string> = {
  default: "bg-primary text-primary-foreground shadow-[0_4px_12px_hsl(var(--primary)/0.18)] hover:-translate-y-px hover:bg-primary-dark hover:shadow-[0_7px_16px_hsl(var(--primary)/0.22)]",
  outline: "border border-border bg-background shadow-sm hover:-translate-y-px hover:border-primary/25 hover:bg-accent hover:text-accent-foreground",
  ghost: "hover:bg-accent hover:text-accent-foreground",
  destructive: "bg-destructive text-destructive-foreground shadow-sm shadow-destructive/15 hover:-translate-y-px hover:bg-destructive/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
};

const sizeClasses: Record<Size, string> = {
  default: "h-10 px-4 py-2 text-sm",
  sm: "h-9 px-3 text-xs",
  icon: "h-10 w-10",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild, ...props }, ref) => {
    const classes = cn(
      "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
      variantClasses[variant],
      sizeClasses[size],
      className,
    );

    if (asChild) {
      const { children } = props;
      const child = children as React.ReactElement<{ className?: string }>;
      if (child && child.props) {
        return {
          ...child,
          props: { ...child.props, className: cn(classes, child.props.className) },
        } as React.ReactElement;
      }
      return null;
    }

    return (
      <button
        ref={ref}
        className={classes}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export const buttonVariants = ({ variant = "default", size = "default", className }: { variant?: Variant; size?: Size; className?: string }) =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-px disabled:pointer-events-none disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
    variantClasses[variant],
    sizeClasses[size],
    className,
  );
