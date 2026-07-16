import { Toaster as SonnerToaster } from "sonner";

export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
  return (
    <SonnerToaster
      closeButton
      toastOptions={{
        classNames: {
          toast: "rounded-md border border-border bg-background text-foreground shadow-md",
          title: "text-sm font-medium",
          description: "text-xs text-muted-foreground",
        },
      }}
      {...props}
    />
  );
}
