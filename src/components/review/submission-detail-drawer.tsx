import { useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PriorityLabel } from "@/components/status-badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MapPin, Phone, User, Calendar, Clock, Image as ImageIcon, CircleCheck as CheckCircle2, Circle as XCircle } from "lucide-react";
import {
  formatFriendlyDateTime, formatFriendlyDate, CHECKLIST_LABELS, REJECTION_REASONS,
  computeCollectorStats,
  type Task, type Collector, type RejectionReason, type VerificationChecklist,
} from "@/lib/mock-data";
import type { SubmissionWithChecklist } from "@/lib/submission-store";
import { cn } from "@/lib/utils";

export function SubmissionDetailDrawer({
  submission,
  task,
  collector,
  open,
  onOpenChange,
  onToggleChecklist,
  onApprove,
  onReject,
}: {
  submission: SubmissionWithChecklist | null;
  task: Task | undefined;
  collector: Collector | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleChecklist: (key: keyof VerificationChecklist) => void;
  onApprove: () => void;
  onReject: (reason: RejectionReason, note: string | undefined) => void;
}) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState<RejectionReason | "">("");
  const [rejectNote, setRejectNote] = useState("");

  if (!submission) return null;

  const readOnly = submission.status !== "pending";
  const rejectNoteRequired = rejectReason === "Other";

  function openReject() {
    setRejectReason("");
    setRejectNote("");
    setRejectOpen(true);
  }

  function confirmReject() {
    if (!rejectReason) return;
    if (rejectNoteRequired && !rejectNote.trim()) return;
    onReject(rejectReason, rejectNote.trim() || undefined);
    setRejectOpen(false);
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <div className="flex items-center gap-2">
              <SheetTitle className="text-left">{submission.taskTitle}</SheetTitle>
              <ReviewStatusPill status={submission.status} />
            </div>
            <SheetDescription className="text-left">{submission.id} · {task?.id ?? submission.taskId}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-6 pb-6 text-sm">
            {/* Task information */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Task information</h3>
              {task ? (
                <>
                  <p className="text-foreground">{task.description}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>Hotspot: {task.hotspotType}</span>
                    <span className="flex items-center gap-1"><PriorityLabel priority={task.priority} /> priority</span>
                    <span>Zone: {task.zone}</span>
                    <span>Due {formatFriendlyDate(task.dueAt)}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3.5 w-3.5" /> {task.location} · {task.latitude.toFixed(4)}, {task.longitude.toFixed(4)}
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Original task details are unavailable.</p>
              )}
            </section>

            {/* Collector information */}
            <section className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-3">
              <Detail icon={<User className="h-3.5 w-3.5" />} label="Collector" value={submission.collector} />
              <Detail icon={<Phone className="h-3.5 w-3.5" />} label="Phone" value={collector?.phone ?? "—"} />
              <Detail icon={<MapPin className="h-3.5 w-3.5" />} label="Zone" value={collector?.zone ?? submission.zone} />
              <Detail label="Tasks completed" value={collector ? String(computeCollectorStats(collector.name).tasksApproved) : "—"} />
              <Detail label="Approval rate" value={collector ? `${computeCollectorStats(collector.name).approvalRate}%` : "—"} />

            </section>

            {/* Proof of work */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Proof of work</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PhotoPanel label="Before" present={submission.hasBeforePhoto} />
                <PhotoPanel label="After" present={submission.hasAfterPhoto} />
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-card p-3">
                <Detail label="Waste type" value={submission.wasteType} />
                <Detail label="Quantity estimate" value={`${submission.quantityKg} kg`} />
                <Detail icon={<Clock className="h-3.5 w-3.5" />} label="Submission time" value={formatFriendlyDateTime(submission.submittedAt)} />
                <Detail icon={<MapPin className="h-3.5 w-3.5" />} label="Submission coordinates" value={`${submission.latitude.toFixed(4)}, ${submission.longitude.toFixed(4)}`} />
              </div>
              {submission.note && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground">Collector notes</div>
                  <p className="rounded border border-border bg-background px-2 py-1.5 text-foreground">"{submission.note}"</p>
                </div>
              )}
            </section>

            {/* Verification checklist */}
            <section className="space-y-2 rounded-md border border-border bg-card p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verification checklist</h3>
              <ul className="space-y-2">
                {(Object.keys(CHECKLIST_LABELS) as (keyof VerificationChecklist)[]).map((key) => (
                  <li key={key} className="flex items-start gap-2">
                    <Checkbox
                      id={`chk-${key}`}
                      checked={submission.checklist[key]}
                      disabled={readOnly}
                      onCheckedChange={() => onToggleChecklist(key)}
                      className="mt-0.5"
                    />
                    <label
                      htmlFor={`chk-${key}`}
                      className={cn(
                        "text-sm leading-tight",
                        submission.checklist[key] ? "text-foreground" : "text-muted-foreground",
                        !readOnly && "cursor-pointer",
                      )}
                    >
                      {CHECKLIST_LABELS[key]}
                    </label>
                  </li>
                ))}
              </ul>
            </section>

            {/* Reviewed submission read-only summary */}
            {readOnly && (
              <section className={cn(
                "space-y-1.5 rounded-md border p-3 text-sm",
                submission.status === "approved" ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5",
              )}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review result</h3>
                <div className="flex items-center gap-1.5 font-medium text-foreground">
                  {submission.status === "approved" ? (
                    <><CheckCircle2 className="h-4 w-4 text-success" /> Approved</>
                  ) : (
                    <><XCircle className="h-4 w-4 text-destructive" /> Rejected</>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  Reviewed by {submission.reviewer ?? "—"} · {submission.decidedAt ? formatFriendlyDateTime(submission.decidedAt) : "—"}
                </div>
                {submission.status === "rejected" && submission.rejectionReason && (
                  <div className="text-xs text-foreground">
                    Reason: {submission.rejectionReason}
                    {submission.rejectionNote && ` — ${submission.rejectionNote}`}
                  </div>
                )}
              </section>
            )}
          </div>

          {!readOnly && (
            <SheetFooter className="sticky bottom-0 -mx-6 flex-row gap-2 border-t border-border bg-background px-6 py-4">
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={openReject}>
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button size="sm" className="ml-auto gap-1.5" onClick={() => setApproveOpen(true)}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Approve this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              {submission.taskTitle} will be marked approved and the task will be closed out as complete.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onApprove(); setApproveOpen(false); }}>Approve</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject this submission?</AlertDialogTitle>
            <AlertDialogDescription>
              {submission.collector} will be asked to revisit and resubmit proof for {submission.taskTitle}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <Select value={rejectReason} onValueChange={(v) => setRejectReason(v as RejectionReason)}>
              <SelectTrigger><SelectValue placeholder="Select a rejection reason" /></SelectTrigger>
              <SelectContent>
                {REJECTION_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {rejectNoteRequired && (
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="Explain the reason for rejection"
                className="min-h-20"
              />
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!rejectReason || (rejectNoteRequired && !rejectNote.trim())}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmReject}
            >
              Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReviewStatusPill({ status }: { status: "pending" | "approved" | "rejected" }) {
  const styles: Record<typeof status, string> = {
    pending: "bg-indigo/10 text-indigo border-indigo/25",
    approved: "bg-success/12 text-success border-success/30",
    rejected: "bg-destructive/10 text-destructive border-destructive/25",
  };
  const labels: Record<typeof status, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected" };
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium tracking-tight", styles[status])}>
      {labels[status]}
    </span>
  );
}

function PhotoPanel({ label, present }: { label: string; present: boolean }) {
  return (
    <div className={cn(
      "grid aspect-video place-items-center rounded-md border text-muted-foreground",
      present ? "border-dashed border-border bg-muted" : "border-dashed border-destructive/40 bg-destructive/5",
    )}>
      <div className="flex flex-col items-center gap-1 text-xs">
        <ImageIcon className="h-6 w-6" />
        {label} photo
        {!present && <span className="font-medium text-destructive">Not provided</span>}
      </div>
    </div>
  );
}

function Detail({ icon, label, value }: { icon?: React.ReactNode; label: string; value: string }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">{icon}{label}</div>
      <div className="text-foreground">{value}</div>
    </div>
  );
}
