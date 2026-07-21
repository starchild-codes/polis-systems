import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, EmptyState } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, X, ListFilter, MoveHorizontal as MoreHorizontal, Users, UserCheck, UserPlus, UserX, Phone, MapPin, Calendar, Pencil, Ban, Trash2, RotateCcw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  COLLECTOR_STATUSES, COLLECTOR_TYPES, PREFERRED_LANGUAGES,
  computeCollectorCounts, computeCollectorStats, computeCollectorIsRecentlyActive,
  computeCollectorTaskHistory, formatFriendlyDate, formatFriendlyDateTime,
  isValidE164Phone, isPhoneNumberTaken,
  type Collector, type CollectorStatus, type CollectorType, type Zone,
} from "@/lib/mock-data";
import { useCollectorStore, useCollectorStoreState, collectorStoreActions, type NewCollectorInput } from "@/lib/collector-store";
import { useTaskStore } from "@/lib/task-store";
import { FALLBACK_ZONES, useZones } from "@/lib/zone-store";
import { useSubmissionStore } from "@/lib/submission-store";
import { StatusBadge } from "@/components/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAlert as AlertCircle } from "lucide-react";
import { getUserFacingError } from "@/lib/safe-display";

export const Route = createFileRoute("/collectors")({
  validateSearch: (search: Record<string, unknown>): { query?: string } => ({
    query: typeof search.query === "string" && search.query.trim() ? search.query : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Collectors — Polis Systems" },
      { name: "description", content: "Manage field collectors and monitor operational participation." },
    ],
  }),
  component: CollectorsPage,
});

function nowIso(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10) + " " + d.toTimeString().slice(0, 5);
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const STATUS_LABEL: Record<CollectorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  suspended: "Suspended",
  pending: "Pending Registration",
};

const STATUS_STYLE: Record<CollectorStatus, string> = {
  active: "bg-success/12 text-success border-success/30",
  inactive: "bg-muted text-muted-foreground border-border",
  suspended: "bg-destructive/10 text-destructive border-destructive/25",
  pending: "bg-warning/10 text-warning border-warning/25",
};

function collectorSaveError(error: unknown): string | undefined {
  if (!(error instanceof Error)) return "The collector could not be saved. Please try again.";
  const message = error.message.toLowerCase();
  if (message.includes("collectors_organization_phone_e164_key") || message.includes("phone_e164")) {
    return "A collector with this phone number is already registered in this organization.";
  }
  if (message.includes("row-level security") || message.includes("permission denied")) {
    return "Only organization administrators can add collectors.";
  }
  return getUserFacingError(error, "The collector could not be saved. Please try again.");
}

function CollectorStatusBadge({ status }: { status: CollectorStatus }) {
  return (
    <span className={`inline-flex min-h-5 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function CollectorsPage() {
  const routeSearch = Route.useSearch();
  const collectors = useCollectorStore();
  const { loading, error } = useCollectorStoreState();
  const zones = useZones();
  const zoneNames = useMemo(
    () => Array.from(new Set([
      ...FALLBACK_ZONES,
      ...zones.map((zone) => zone.name),
      ...collectors.map((collector) => collector.zone),
    ])),
    [collectors, zones],
  );
  const { tasks } = useTaskStore();
  const submissions = useSubmissionStore();

  const [query, setQuery] = useState(routeSearch.query ?? "");
  const [status, setStatus] = useState<CollectorStatus | "all">("all");
  const [zone, setZone] = useState<Zone | "all">("all");
  const [type, setType] = useState<CollectorType | "all">("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Collector | null>(null);
  const [selected, setSelected] = useState<Collector | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [confirm, setConfirm] = useState<{ id: string; name: string; action: "deactivate" | "suspend" } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Collector | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setQuery(routeSearch.query ?? "");
  }, [routeSearch.query]);

  const counts = useMemo(() => computeCollectorCounts(collectors), [collectors]);

  const filtered = useMemo(() => {
    return collectors.filter((c) => {
      if (status !== "all" && c.status !== status) return false;
      if (zone !== "all" && c.zone !== zone) return false;
      if (type !== "all" && c.collectorType !== type) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${c.name} ${c.phone} ${c.zone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [collectors, query, status, zone, type]);

  const filtersActive = query !== "" || status !== "all" || zone !== "all" || type !== "all";

  function clearFilters() {
    setQuery(""); setStatus("all"); setZone("all"); setType("all");
  }

  function openDetail(c: Collector) {
    setSelected(c);
    setDetailOpen(true);
  }

  async function handleCreate(input: NewCollectorInput) {
    setSaving(true);
    try {
      const c = await collectorStoreActions.createCollector(input);
      toast.success("Collector added", { description: `${c.name} is now ${STATUS_LABEL[c.status].toLowerCase()}.` });
    } catch (err) {
      toast.error("Failed to add collector", { description: collectorSaveError(err) });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: string, patch: Partial<NewCollectorInput>) {
    setSaving(true);
    try {
      await collectorStoreActions.editCollector(id, patch);
      toast.success("Collector updated");
    } catch (err) {
      toast.error("Failed to update collector", { description: getUserFacingError(err, "The collector could not be updated. Please try again.") });
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: string, next: CollectorStatus, name: string) {
    if (next === "inactive" || next === "suspended") {
      setConfirm({ id, name, action: next === "inactive" ? "deactivate" : "suspend" });
      return;
    }
    try {
      await collectorStoreActions.setStatus(id, next);
      toast.success(`${name} — ${STATUS_LABEL[next]}`);
    } catch (err) {
      toast.error("Failed to update status", { description: getUserFacingError(err, "The collector status could not be updated. Please try again.") });
    }
  }

  async function confirmStatusChange() {
    if (!confirm) return;
    const next: CollectorStatus = confirm.action === "deactivate" ? "inactive" : "suspended";
    try {
      await collectorStoreActions.setStatus(confirm.id, next);
      toast.success(`${confirm.name} — ${STATUS_LABEL[next]}`);
    } catch (err) {
      toast.error("Failed to update status", { description: getUserFacingError(err, "The collector status could not be updated. Please try again.") });
    } finally {
      setConfirm(null);
    }
  }

  async function confirmDeleteCollector() {
    if (!deleteTarget) return;
    try {
      await collectorStoreActions.deleteCollector(deleteTarget.id);
      toast.success("Collector permanently deleted", { description: `${deleteTarget.name} was removed.` });
      setSelected(null);
      setDetailOpen(false);
    } catch (err) {
      toast.error("Could not delete collector", { description: getUserFacingError(err, "The collector could not be deleted. Please try again.") });
    } finally {
      setDeleteTarget(null);
    }
  }

  const liveSelected = selected ? collectors.find((c) => c.id === selected.id) ?? selected : null;

  return (
    <>
      <PageHeader
        title="Collectors"
        description="Manage field collectors and monitor operational participation"
        actions={
          <Button size="sm" className="dashboard-primary-action gap-1.5" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15"><Plus className="h-3.5 w-3.5" /></span> Add Collector
          </Button>
        }
      />

      <div className="page-shell animate-fade-up">
        {/* Summary metrics */}
        <section aria-label="Collector metrics" className="collector-metric-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Total Collectors" value={counts.total} icon={<Users className="h-4 w-4" />} />
          <Metric label="Active" value={counts.active} icon={<UserCheck className="h-4 w-4" />} tone="success" />
          <Metric label="Pending Registration" value={counts.pending} icon={<UserPlus className="h-4 w-4" />} tone="warning" />
          <Metric label="Inactive / Suspended" value={counts.inactiveOrSuspended} icon={<UserX className="h-4 w-4" />} tone="muted" />
        </section>

        {/* Filters */}
        <div className="dashboard-filter-bar flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name, phone, or zone"
              className="pl-8"
            />
          </div>
          <Select className="!w-[9.5rem]" value={status} onValueChange={(v) => setStatus(v as CollectorStatus | "all")}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {COLLECTOR_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select className="!w-32" value={zone} onValueChange={(v) => setZone(v as Zone | "all")}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Zone" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              {zoneNames.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select className="!w-40" value={type} onValueChange={(v) => setType(v as CollectorType | "all")}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {COLLECTOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          {filtersActive && (
            <Button variant="ghost" size="sm" className="h-9 gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear filters
            </Button>
          )}
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <ListFilter className="h-3.5 w-3.5" /> {filtered.length} of {collectors.length} collectors
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="surface-card space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center shadow-surface">
            <AlertCircle className="h-6 w-6 text-destructive" />
            <h3 className="mt-2 text-sm font-semibold text-destructive">Failed to load collectors</h3>
            <p className="mt-1 text-sm text-muted-foreground">{getUserFacingError(error, "Collectors could not be loaded. Please try again.")}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => collectorStoreActions.refresh()}>Retry</Button>
          </div>
        ) : collectors.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No collectors added"
            description="Add your first field collector to start assigning cleanup tasks."
            action={<Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>Add Collector</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<ListFilter className="h-5 w-5" />}
            title="No collectors match your filters"
            description="Try adjusting or clearing your filters to see more collectors."
            action={<Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <div className="dashboard-table-shell">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-muted/35">
                  <TableHead className="min-w-[180px]">Collector</TableHead>
                  <TableHead className="hidden md:table-cell">Phone</TableHead>
                  <TableHead>Zone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Assigned</TableHead>
                  <TableHead className="text-right">Accepted</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead className="text-right">Approval</TableHead>
                  <TableHead className="hidden lg:table-cell">Last active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = computeCollectorStats(c.name, tasks, submissions);
                  const recentlyActive = computeCollectorIsRecentlyActive(c.name, tasks);
                  return (
                    <TableRow key={c.id} className="dashboard-row" onClick={() => openDetail(c)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 ring-2 ring-primary/10">
                            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary-dark">
                              {initials(c.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-foreground">{c.name}</div>
                            <div className="max-w-40 truncate text-xs text-muted-foreground">{c.collectorType ?? c.organization ?? "Field collector"}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground tabular-nums">{c.phone}</TableCell>
                      <TableCell className="text-sm text-foreground">{c.zone}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <CollectorStatusBadge status={c.status} />
                          {recentlyActive && c.status === "active" && (
                            <span className="text-[10px] text-muted-foreground">Active in last 14 days</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground">{s.tasksAssigned}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground">{s.tasksAccepted}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground">{s.tasksApproved}</TableCell>
                      <TableCell className="text-right text-sm tabular-nums text-foreground">{s.approvalRate}%</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        {c.lastActiveAt === "—" ? "—" : formatFriendlyDateTime(c.lastActiveAt)}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <RowActions collector={c} onEdit={() => { setEditing(c); setFormOpen(true); }} onStatus={(next) => handleStatusChange(c.id, next, c.name)} onDelete={() => setDeleteTarget(c)} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CollectorFormSheet
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        collectors={collectors}
        zoneNames={zoneNames}
        onCreate={handleCreate}
        onEdit={handleEdit}
      />

      <CollectorDetailDrawer
        collector={liveSelected}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={() => { if (liveSelected) { setEditing(liveSelected); setDetailOpen(false); setFormOpen(true); } }}
        onStatus={(next) => { if (liveSelected) handleStatusChange(liveSelected.id, next, liveSelected.name); }}
        onDelete={() => { if (liveSelected) setDeleteTarget(liveSelected); }}
      />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.action === "deactivate" ? "Deactivate this collector?" : "Suspend this collector?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.name} will no longer appear in new task assignment dropdowns. Existing task history and current assignments remain intact — this can be reversed at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirm?.action === "suspend" ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
              onClick={confirmStatusChange}
            >
              {confirm?.action === "deactivate" ? "Deactivate" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete this collector?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Collectors with active assigned tasks must have those tasks reassigned or removed first. Proof-of-work history is retained and also prevents deletion.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep collector</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteCollector}>
              Delete collector
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function RowActions({
  collector, onEdit, onStatus, onDelete,
}: { collector: Collector; onEdit: () => void; onStatus: (next: CollectorStatus) => void; onDelete: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9" aria-label={`Open actions for ${collector.name}`}><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={onEdit}><Pencil className="h-4 w-4 text-muted-foreground" /> Edit collector</DropdownMenuItem>
        <DropdownMenuSeparator />
        {collector.status !== "active" && (
          <DropdownMenuItem onClick={() => onStatus("active")}><CheckCircle2 className="h-4 w-4 text-success" /> Activate</DropdownMenuItem>
        )}
        {collector.status !== "pending" && (
          <DropdownMenuItem onClick={() => onStatus("pending")}><RotateCcw className="h-4 w-4 text-muted-foreground" /> Restore to Pending Registration</DropdownMenuItem>
        )}
        {collector.status !== "inactive" && (
          <DropdownMenuItem className="text-warning" onClick={() => onStatus("inactive")}><Ban className="h-4 w-4" /> Deactivate</DropdownMenuItem>
        )}
        {collector.status !== "suspended" && (
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onStatus("suspended")}>
            <Ban className="h-4 w-4" /> Suspend
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}><Trash2 className="h-4 w-4" /> Delete permanently</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Metric({
  label, value, icon, tone = "default",
}: { label: string; value: number; icon: React.ReactNode; tone?: "default" | "success" | "warning" | "muted" }) {
  const toneStyle =
    tone === "success" ? "text-success" :
    tone === "warning" ? "text-warning" :
    tone === "muted" ? "text-muted-foreground" :
    "text-primary";
  return (
    <div className="dashboard-metric group">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-current/10 transition-transform duration-200 group-hover:scale-105 motion-reduce:transform-none ${toneStyle}`}>{icon}</span>
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
    </div>
  );
}

// ─────────────────────────── Add / Edit form ───────────────────────────

interface FormValues {
  name: string;
  phone: string;
  zone: Zone | "";
  status: CollectorStatus | "";
  collectorType: CollectorType | "";
  organization: string;
  preferredLanguage: string;
  internalNotes: string;
}

const emptyForm: FormValues = {
  name: "", phone: "", zone: "", status: "pending",
  collectorType: "", organization: "", preferredLanguage: "", internalNotes: "",
};

type FormErrors = Partial<Record<keyof FormValues, string>>;

function CollectorFormSheet({
  open, onOpenChange, editing, collectors, zoneNames, onCreate, onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Collector | null;
  collectors: Collector[];
  zoneNames: string[];
  onCreate: (input: NewCollectorInput) => void;
  onEdit: (id: string, patch: Partial<NewCollectorInput>) => void;
}) {
  const isEditing = !!editing;
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});

  // Reset form when the sheet opens or the editing target changes.
  useEffect(() => {
    if (open) {
      setValues(editing ? {
        name: editing.name,
        phone: editing.phone,
        zone: editing.zone,
        status: editing.status,
        collectorType: editing.collectorType ?? "",
        organization: editing.organization ?? "",
        preferredLanguage: editing.preferredLanguage ?? "",
        internalNotes: editing.internalNotes ?? "",
      } : emptyForm);
      setErrors({});
    }
  }, [open, editing]);

  function set<K extends keyof FormValues>(k: K, v: FormValues[K]) {
    setValues((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  }

  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!values.name.trim()) e.name = "Full name is required.";
    if (!values.phone.trim()) e.phone = "Phone number is required.";
    else if (!isValidE164Phone(values.phone)) e.phone = "Use E.164 format, e.g. +919845012034.";
    else if (isPhoneNumberTaken(values.phone, collectors, editing?.id)) e.phone = "This phone number is already registered.";
    if (!values.zone) e.zone = "Zone is required.";
    if (!values.status) e.status = "Status is required.";
    return e;
  }

  function submit() {
    const e = validate();
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    const input: NewCollectorInput = {
      name: values.name.trim(),
      phone: values.phone.trim(),
      zone: values.zone as Zone,
      status: values.status as CollectorStatus,
      collectorType: values.collectorType || undefined,
      organization: values.organization.trim() || undefined,
      preferredLanguage: values.preferredLanguage || undefined,
      internalNotes: values.internalNotes.trim() || undefined,
    };
    if (isEditing && editing) onEdit(editing.id, input);
    else onCreate(input);
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Collector" : "Add Collector"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the collector's profile and status." : "Register a new field collector. Active collectors immediately become available for task assignment."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-7 px-5 py-5 sm:px-6">
          <section className="space-y-3">
            <h3 className="section-label">Identity</h3>
            <Field label="Full name" error={errors.name} required>
              <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Ravi Kumar" />
            </Field>
            <Field label="Phone number" error={errors.phone} hint="Include country code, e.g. +919845012034." required>
              <Input value={values.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+91…" inputMode="tel" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Zone" error={errors.zone} required>
                <Select value={values.zone} onValueChange={(v) => set("zone", v as Zone)}>
                  <SelectTrigger><SelectValue placeholder="Select zone" /></SelectTrigger>
                  <SelectContent>
                    {zoneNames.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Status" error={errors.status} required>
                <Select value={values.status} onValueChange={(v) => set("status", v as CollectorStatus)}>
                  <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent>
                    {COLLECTOR_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="section-label">Optional details</h3>
            <Field label="Collector type">
              <Select value={values.collectorType} onValueChange={(v) => set("collectorType", v as CollectorType)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {COLLECTOR_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Organization affiliation">
              <Input value={values.organization} onChange={(e) => set("organization", e.target.value)} placeholder="NGO, contractor, or municipal department" />
            </Field>
            <Field label="Preferred language">
              <Select value={values.preferredLanguage} onValueChange={(v) => set("preferredLanguage", v)}>
                <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                <SelectContent>
                  {PREFERRED_LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Internal notes">
              <Textarea value={values.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} placeholder="Visible to operators only" />
            </Field>
          </section>
        </div>

        <SheetFooter className="sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{isEditing ? "Save changes" : "Add collector"}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Field({
  label, error, hint, required, children,
}: { label: string; error?: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ─────────────────────────── Detail drawer ───────────────────────────

function CollectorDetailDrawer({
  collector, open, onOpenChange, onEdit, onStatus, onDelete,
}: {
  collector: Collector | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onStatus: (next: CollectorStatus) => void;
  onDelete: () => void;
}) {
  const { tasks } = useTaskStore();
  const submissions = useSubmissionStore();
  if (!collector) return null;

  const stats = computeCollectorStats(collector.name, tasks, submissions);
  const recentlyActive = computeCollectorIsRecentlyActive(collector.name, tasks);
  const history = computeCollectorTaskHistory(collector.name, tasks);
  const acceptanceDenominator = stats.tasksAccepted + stats.tasksDeclined;
  const acceptanceRate = acceptanceDenominator ? Math.round((stats.tasksAccepted / acceptanceDenominator) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary-dark">
                {initials(collector.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate">{collector.name}</SheetTitle>
              <SheetDescription>Field collector · {collector.zone} zone</SheetDescription>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CollectorStatusBadge status={collector.status} />
            {recentlyActive && collector.status === "active" && (
              <span className="inline-flex items-center rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                Active in last 14 days
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          <section className="surface-card grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2">
            <Detail icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={collector.phone} />
            <Detail icon={<MapPin className="h-3.5 w-3.5" />} label="Zone" value={collector.zone} />
            <Detail label="Collector type" value={collector.collectorType ?? "—"} />
            <Detail label="Organization" value={collector.organization ?? "—"} />
            <Detail label="Preferred language" value={collector.preferredLanguage ?? "—"} />
            <Detail icon={<Calendar className="h-3.5 w-3.5" />} label="Registered" value={formatFriendlyDate(collector.registeredAt)} />
            <Detail label="Last active" value={collector.lastActiveAt === "—" ? "—" : formatFriendlyDateTime(collector.lastActiveAt)} />
            <Detail label="Account status" value={STATUS_LABEL[collector.status]} />
          </section>

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performance</h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <PerfStat label="Assigned" value={stats.tasksAssigned} />
              <PerfStat label="Accepted" value={stats.tasksAccepted} />
              <PerfStat label="Declined" value={stats.tasksDeclined} />
              <PerfStat label="Submitted" value={stats.tasksSubmitted} />
              <PerfStat label="Approved" value={stats.tasksApproved} />
              <PerfStat label="Approval rate" value={`${stats.approvalRate}%`} />
              <PerfStat label="Acceptance rate" value={`${acceptanceRate}%`} />
            </div>
          </section>

          {collector.internalNotes && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Internal notes</h3>
              <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-foreground">{collector.internalNotes}</p>
            </section>
          )}

          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent task history</h3>
            {history.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                No task history for this collector yet.
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableHead>Task</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden sm:table-cell">Assigned</TableHead>
                      <TableHead className="text-right">Last update</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.slice(0, 8).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div className="text-sm font-medium text-foreground">{t.title}</div>
                          <div className="text-xs text-muted-foreground">{t.zone}</div>
                        </TableCell>
                        <TableCell><StatusBadge status={t.status} /></TableCell>
                        <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{formatFriendlyDate(t.createdAt)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">{formatFriendlyDate(t.updatedAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>

        <SheetFooter className="sticky bottom-0 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onEdit}>Edit collector</Button>
          {collector.status !== "active" && (
            <Button variant="outline" onClick={() => onStatus("active")}>Activate</Button>
          )}
          {collector.status === "active" && (
            <Button variant="outline" onClick={() => onStatus("inactive")}>Deactivate</Button>
          )}
          {collector.status !== "suspended" && (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => onStatus("suspended")}
            >
              Suspend
            </Button>
          )}
          <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={onDelete}>Delete collector</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 truncate text-sm text-foreground">{value}</div>
    </div>
  );
}

function PerfStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border/90 bg-card p-3 shadow-sm">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}
