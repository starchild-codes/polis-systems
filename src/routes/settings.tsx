import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Polis Systems" },
      { name: "description", content: "Configure your organisation, zones, and notifications." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Organisation, zones, and notification preferences"
      />

      <div className="settings-layout page-shell max-w-5xl animate-fade-up">
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.85fr)]">
          <div className="settings-cluster surface-card overflow-hidden divide-y divide-border/80">
            <Section title="Organisation" description="Displayed on reports and collector messages.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Organisation name"><Input defaultValue="Florida Pilot Operations" /></Field>
                <Field label="Region"><Input defaultValue="Florida" /></Field>
                <Field label="Support email" className="sm:col-span-2"><Input defaultValue="operations@polissystems.example" type="email" /></Field>
              </div>
            </Section>

            <Section title="Zones" description="Operational zones currently available to your teams.">
              <div className="flex flex-wrap gap-2">
                {["North", "South", "East", "West", "Central"].map((z) => (
                  <span key={z} className="inline-flex items-center rounded-lg border border-primary/12 bg-primary/[0.04] px-2.5 py-1.5 text-xs font-medium text-primary">
                    {z}
                  </span>
                ))}
              </div>
            </Section>
          </div>

          <div className="settings-cluster surface-card overflow-hidden">
            <Section title="Notifications" description="Choose what triggers a notification.">
              <ToggleRow label="New submissions" description="Notify when a collector submits proof-of-work." defaultChecked />
              <ToggleRow label="Urgent tasks" description="Alert operators for urgent priority tasks." defaultChecked />
              <ToggleRow label="Weekly digest" description="Every Monday morning summary." />
            </Section>
          </div>
        </div>

        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <Button variant="outline">Cancel</Button>
          <Button onClick={() => toast.success("Settings saved")}>Save changes</Button>
        </div>
      </div>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="settings-section overflow-hidden">
      <div className="px-5 pb-3 pt-5">
        <p className="section-label mb-1">Configuration</p>
        <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 px-5 pb-5">{children}</div>
    </section>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  defaultChecked,
}: {
  label: string;
  description: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-t-0 first:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}
