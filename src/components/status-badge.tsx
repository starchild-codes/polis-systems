import { Badge } from "@/components/ui/badge";
import type { TaskStatus, Priority } from "@/lib/mock-data";

type ReviewStatus = "pending" | "approved" | "rejected";

const labelMap: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const variantMap: Record<ReviewStatus, "warning" | "success" | "destructive"> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
};

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return <Badge variant={variantMap[status]}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{labelMap[status]}</Badge>;
}

const taskStatusLabel: Record<TaskStatus, string> = {
  open: "Draft",
  assigned: "Assigned",
  accepted: "Accepted",
  in_progress: "In Progress",
  submitted: "Awaiting Review",
  approved: "Approved",
  declined: "Declined",
  rejected: "Rejected",
  canceled: "Canceled",
};

const taskStatusVariant: Record<TaskStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  open: "secondary",
  assigned: "default",
  accepted: "default",
  in_progress: "warning",
  submitted: "warning",
  approved: "success",
  declined: "destructive",
  rejected: "destructive",
  canceled: "secondary",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge variant={taskStatusVariant[status]}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{taskStatusLabel[status]}</Badge>;
}

const priorityLabel: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const priorityVariant: Record<Priority, "default" | "secondary" | "destructive" | "warning"> = {
  low: "secondary",
  medium: "default",
  high: "warning",
  urgent: "destructive",
};

export function PriorityLabel({ priority }: { priority: Priority }) {
  return <Badge variant={priorityVariant[priority]}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{priorityLabel[priority]}</Badge>;
}

export const statusBarColor: Record<TaskStatus, string> = {
  open: "bg-muted-foreground/40",
  assigned: "bg-blue-500",
  accepted: "bg-cyan-500",
  in_progress: "bg-amber-500",
  submitted: "bg-orange-500",
  approved: "bg-emerald-500",
  declined: "bg-red-500",
  rejected: "bg-red-600",
  canceled: "bg-muted-foreground/60",
};
