import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { HotspotBadge, PriorityLabel, StatusBadge, ZoneBadge } from "@/components/status-badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MapPin, Phone, User, Calendar, Clock, ImageIcon, MessageCircle, Pencil, Trash2,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  formatFriendlyDateTime, formatFriendlyDate, isTaskOverdue,
  isValidE164Phone,
  type Task, type Collector,
} from "@/lib/mock-data";
import { useTaskEvents } from "@/lib/task-store";
import { getDisplayActorName, getSafeDisplayText } from "@/lib/safe-display";

type DrawerAction = "edit" | "assign" | "reassign" | "whatsapp" | "cancel" | "delete" | "resubmit" | "export";

export function TaskDetailDrawer({
  task,
  open,
  onOpenChange,
  collectors,
  whatsappSending = false,
  onAction,
}: {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collectors: Collector[];
  whatsappSending?: boolean;
  onAction: (action: DrawerAction, collector?: string) => void;
}) {
  const events = useTaskEvents(task?.id ?? "__none");
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<"assign" | "reassign">("assign");
  const [selectedCollector, setSelectedCollector] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!task) return null;

  const overdue = isTaskOverdue(task);
  const assignedCollector = collectors.find((collector) => collector.name === task.assignee);
  const canSendWhatsApp = Boolean(
    task.status === "assigned"
    && assignedCollector
    && isValidE164Phone(assignedCollector.phone),
  );
  const whatsappUnavailableReason = !task.assignee
    ? "Assign a collector first."
    : !assignedCollector || !isValidE164Phone(assignedCollector.phone)
      ? "The assigned collector needs a valid phone number."
      : task.status !== "assigned"
        ? "WhatsApp assignments can only be sent while the task is assigned."
        : undefined;

  function openAssignDialog(mode: "assign" | "reassign") {
    setAssignMode(mode);
    setSelectedCollector("");
    setAssignOpen(true);
  }

  function confirmAssign() {
    if (!selectedCollector) return;
    onAction(assignMode, selectedCollector);
    setAssignOpen(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle className="text-left">{task.title}</SheetTitle>
              <StatusBadge status={task.status} />
            </div>
            <SheetDescription className="text-left">{task.location || `${task.zone} zone`}</SheetDescription>
          </SheetHeader>

          <div className="space-y-6 px-5 py-5 text-sm sm:px-6">
            <section className="space-y-2">
              <p className="text-foreground">{task.description}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">Hotspot: <HotspotBadge type={task.hotspotType} /></span>
                <span className="flex items-center gap-1"><PriorityLabel priority={task.priority} /> priority</span>
                <span className="flex items-center gap-1.5">Zone: <ZoneBadge zone={task.zone} /></span>
              </div>
            </section>

            <section className="surface-card grid gap-4 p-4 sm:grid-cols-2">
              <Detail icon={<User className="h-3.5 w-3.5" />} label="Collector" value={task.assignee ?? "Unassigned"} />
              <Detail icon={<Phone className="h-3.5 w-3.5" />} label="Collector phone" value={collectors.find((c) => c.name === task.assignee)?.phone ?? "—"} />
              <Detail
                icon={<Calendar className="h-3.5 w-3.5" />}
                label="Due date"
                value={formatFriendlyDate(task.dueAt)}
                valueClassName={overdue ? "text-destructive font-medium" : undefined}
              />
              <Detail icon={<Clock className="h-3.5 w-3.5" />} label="Last updated" value={formatFriendlyDateTime(task.updatedAt)} />
            </section>

            <section className="surface-card space-y-1.5 p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" /> Location
              </div>
              <p className="text-foreground">{task.location}</p>
              <p className="text-xs text-muted-foreground">
                {task.latitude.toFixed(4)}, {task.longitude.toFixed(4)}
              </p>
            </section>

            {(task.instructions || task.internalNotes) && (
              <section className="space-y-2">
                {task.instructions && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Instructions</div>
                    <p className="text-foreground">{task.instructions}</p>
                  </div>
                )}
                {task.internalNotes && (
                  <div>
                    <div className="text-xs font-medium text-muted-foreground">Internal notes</div>
                    <p className="text-foreground">{task.internalNotes}</p>
                  </div>
                )}
              </section>
            )}

            {task.hasReferencePhoto && (
              <section className="grid gap-3 sm:grid-cols-2">
                <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-muted/60 text-muted-foreground">
                  <div className="flex flex-col items-center gap-1 text-xs"><ImageIcon className="h-5 w-5" /> Before</div>
                </div>
                <div className="grid aspect-video place-items-center rounded-xl border border-dashed border-border bg-muted/60 text-muted-foreground">
                  <div className="flex flex-col items-center gap-1 text-xs"><ImageIcon className="h-5 w-5" /> After</div>
                </div>
              </section>
            )}

            <section className="space-y-1 text-xs text-muted-foreground">
              <div>Created by {getDisplayActorName(task.createdBy)} · {formatFriendlyDateTime(task.createdAt)}</div>
            </section>

            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Event history</h3>
              <ol className="space-y-2 border-l border-border pl-3">
                {events.map((e) => (
                  <li key={e.id} className="relative text-sm">
                    <span className="absolute -left-[15px] top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                    <div className="break-words text-foreground">{getSafeDisplayText(e.message, "Activity recorded")}</div>
                    <div className="text-xs text-muted-foreground">{formatFriendlyDateTime(e.timestamp)}</div>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <SheetFooter className="sticky bottom-0 flex-row flex-wrap gap-2">
          {renderActions(task, {
            openAssignDialog,
            setCancelOpen,
            onAction,
            canSendWhatsApp,
            whatsappSending,
            whatsappUnavailableReason,
          })}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={assignOpen} onOpenChange={setAssignOpen}>
        <SheetContent side="right" className="w-full sm:max-w-sm">
          <SheetHeader>
            <SheetTitle>{assignMode === "assign" ? "Assign collector" : "Reassign collector"}</SheetTitle>
            <SheetDescription>Choose an active collector for {task.title}.</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-5 py-5 sm:px-6">
            {collectors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active collectors available for assignment.</p>
            ) : (
              <Select value={selectedCollector} onValueChange={setSelectedCollector}>
                <SelectTrigger><SelectValue placeholder="Select a collector" /></SelectTrigger>
                <SelectContent>
                  {collectors.map((c) => <SelectItem key={c.id} value={c.name}>{c.name} · {c.zone}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setAssignOpen(false)}>Cancel</Button>
            <Button onClick={confirmAssign} disabled={!selectedCollector}>Confirm</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {task.title} will be marked canceled. This can't be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep task</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                onAction("cancel");
                setCancelOpen(false);
              }}
            >
              Cancel task
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({
  icon, label, value, valueClassName,
}: { icon: React.ReactNode; label: string; value: string; valueClassName?: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">{icon}{label}</div>
      <div className={valueClassName ?? "text-foreground"}>{value}</div>
    </div>
  );
}

function renderActions(
  task: Task,
  handlers: {
    openAssignDialog: (mode: "assign" | "reassign") => void;
    setCancelOpen: (open: boolean) => void;
    onAction: (action: DrawerAction, collector?: string) => void;
    canSendWhatsApp: boolean;
    whatsappSending: boolean;
    whatsappUnavailableReason?: string;
  },
) {
  const {
    openAssignDialog,
    setCancelOpen,
    onAction,
    canSendWhatsApp,
    whatsappSending,
    whatsappUnavailableReason,
  } = handlers;
  if (task.status === "submitted") {
    return <Button asChild size="sm" className="ml-auto"><Link to="/review" search={{ taskId: task.id }}>Review submission</Link></Button>;
  }
  if (task.status === "approved") {
    return <Button size="sm" className="ml-auto" onClick={() => onAction("export")}>Export record</Button>;
  }
  if (task.status === "canceled") {
    return <span className="text-xs text-muted-foreground">View only — this task is canceled.</span>;
  }

  const canDelete = ["open", "assigned", "accepted", "in_progress"].includes(task.status);
  return (
    <>
      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onAction("edit")}><Pencil className="h-3.5 w-3.5" /> Edit</Button>
      <Button size="sm" onClick={() => openAssignDialog(task.assignee ? "reassign" : "assign")}>{task.assignee ? "Reassign" : "Assign collector"}</Button>
      {task.status === "assigned" && (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!canSendWhatsApp || whatsappSending}
          title={whatsappUnavailableReason}
          onClick={() => onAction("whatsapp")}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          {whatsappSending ? "Sending…" : "Send WhatsApp Assignment"}
        </Button>
      )}
      {task.status === "rejected" && <Button variant="outline" size="sm" onClick={() => onAction("resubmit")}>Request resubmission</Button>}
      <div className="ml-auto flex gap-2">
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelOpen(true)}>Cancel task</Button>
        {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => onAction("delete")}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>}
      </div>
    </>
  );
}
