import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  const context = {
    Overview: "Command center",
    "Cleanup Tasks": "Field operations",
    "Submission Review": "Verification desk",
    Collectors: "People and coverage",
    Reports: "Operational intelligence",
    Settings: "Workspace configuration",
  }[title] ?? "Operations workspace";

  return (
    <div className="dashboard-page-header flex flex-col items-start justify-between gap-4 border-b border-border/80 bg-background/90 px-4 py-5 backdrop-blur-sm sm:flex-row sm:items-center sm:px-5 lg:px-8">
      <div className="relative min-w-0 pl-4 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-px before:bg-primary/25">
        <p className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary/80">
          <span aria-hidden="true" className="-ml-[1.18rem] h-2 w-2 rounded-full border-2 border-background bg-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]" />
          {context}
        </p>
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-foreground sm:text-[1.7rem]">{title}</h1>
        {description && <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-primary/25 bg-[radial-gradient(circle_at_50%_0%,hsl(var(--primary)/0.09),transparent_52%)] px-6 py-14 text-center">
      {icon && <div className="empty-state-icon mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-background text-primary ring-1 ring-primary/15">{icon}</div>}
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
