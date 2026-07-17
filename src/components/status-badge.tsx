import { Badge } from "@/components/ui/badge";
import type { HotspotType, Priority, TaskStatus, WasteType, Zone } from "@/lib/mock-data";

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

const taskStatusClass: Record<TaskStatus, string> = {
  open: "border-slate-300 bg-slate-50 text-slate-700",
  assigned: "border-blue-200 bg-blue-50 text-blue-700",
  accepted: "border-cyan-200 bg-cyan-50 text-cyan-700",
  in_progress: "border-violet-200 bg-violet-50 text-violet-700",
  submitted: "border-amber-200 bg-amber-50 text-amber-800",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  declined: "border-orange-200 bg-orange-50 text-orange-800",
  rejected: "border-red-200 bg-red-50 text-red-700",
  canceled: "border-slate-300 bg-slate-100 text-slate-600",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge className={taskStatusClass[status]}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{taskStatusLabel[status]}</Badge>;
}

const priorityLabel: Record<Priority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

const priorityClass: Record<Priority, string> = {
  low: "border-teal-200 bg-teal-50 text-teal-700",
  medium: "border-indigo-200 bg-indigo-50 text-indigo-700",
  high: "border-orange-200 bg-orange-50 text-orange-800",
  urgent: "border-red-200 bg-red-50 text-red-700",
};

export function PriorityLabel({ priority }: { priority: Priority }) {
  return <Badge className={priorityClass[priority]}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{priorityLabel[priority]}</Badge>;
}

const hotspotClass: Record<HotspotType, string> = {
  "Illegal dumping": "border-rose-200 bg-rose-50 text-rose-700",
  "Plastic litter": "border-sky-200 bg-sky-50 text-sky-700",
  "Organic waste": "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Construction debris": "border-amber-200 bg-amber-50 text-amber-800",
  "Market waste": "border-pink-200 bg-pink-50 text-pink-700",
  "Drainage or canal waste": "border-blue-200 bg-blue-50 text-blue-700",
  "Mixed waste": "border-slate-300 bg-slate-50 text-slate-700",
  Other: "border-violet-200 bg-violet-50 text-violet-700",
};

const wasteClass: Record<WasteType, string> = {
  "Mixed Municipal": "border-slate-300 bg-slate-50 text-slate-700",
  Plastic: "border-sky-200 bg-sky-50 text-sky-700",
  Organic: "border-emerald-200 bg-emerald-50 text-emerald-700",
  "Construction Debris": "border-amber-200 bg-amber-50 text-amber-800",
  "E-Waste": "border-violet-200 bg-violet-50 text-violet-700",
  "Sewage/Sludge": "border-blue-200 bg-blue-50 text-blue-700",
};

const zoneClass: Record<Zone, string> = {
  North: "border-sky-200 bg-sky-50 text-sky-700",
  South: "border-emerald-200 bg-emerald-50 text-emerald-700",
  East: "border-amber-200 bg-amber-50 text-amber-800",
  West: "border-violet-200 bg-violet-50 text-violet-700",
  Central: "border-rose-200 bg-rose-50 text-rose-700",
};

export function HotspotBadge({ type }: { type: HotspotType }) {
  return <Badge className={hotspotClass[type]}>{type}</Badge>;
}

export function WasteTypeBadge({ type }: { type: WasteType }) {
  return <Badge className={wasteClass[type]}>{type}</Badge>;
}

export function ZoneBadge({ zone }: { zone: Zone }) {
  return <Badge className={zoneClass[zone]}>{zone}</Badge>;
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
