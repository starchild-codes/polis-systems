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

      <div className="max-w-3xl space-y-6 p-6">
        <Section title="Organisation" description="Displayed on reports and collector messages.">
          <Field label="Organisation name">
            <Input defaultValue="Bengaluru Municipal Sanitation" />
          </Field>
          <Field label="Region">
            <Input defaultValue="Bengaluru Urban, Karnataka" />
          </Field>
          <Field label="Support email">
            <Input defaultValue="ops@polissystems.example.in" type="email" />
          </Field>
        </Section>

        <Section title="Zones" description="Operational zones covered by your teams.">
          <div className="flex flex-wrap gap-2">
            {["North", "South", "East", "West", "Central"].map((z) => (
              <span
                key={z}
                className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground"
              >
                {z}
              </span>
            ))}
          </div>
        </Section>

        <Section title="Notifications" description="Choose what triggers a notification.">
          <ToggleRow label="New submissions" description="Notify when a collector submits proof-of-work." defaultChecked />
          <ToggleRow label="Urgent tasks" description="Alert operators for urgent priority tasks." defaultChecked />
          <ToggleRow label="Weekly digest" description="Every Monday morning summary." />
        </Section>

        <div className="flex justify-end gap-2">
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
    <section className="rounded-md border border-border bg-card">
      <div className="border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
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
