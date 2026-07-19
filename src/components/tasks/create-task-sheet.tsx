import { useEffect, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  HOTSPOT_TYPES, PRIORITIES,
  type Task, type HotspotType, type Priority, type Zone, type WasteType,
} from "@/lib/mock-data";
import type { NewTaskInput } from "@/lib/task-store";

const WASTE_TYPES: WasteType[] = ["Mixed Municipal", "Plastic", "Organic", "Construction Debris", "E-Waste", "Sewage/Sludge"];

export interface TaskFormValues {
  title: string;
  description: string;
  hotspotType: HotspotType | "";
  priority: Priority | "";
  assignee: string;
  dueAt: string;
  location: string;
  latitude: string;
  longitude: string;
  zone: Zone | "";
  wasteType: WasteType | "";
  estimatedWasteKg: string;
  instructions: string;
  internalNotes: string;
  hasReferencePhoto: boolean;
}

const emptyForm: TaskFormValues = {
  title: "",
  description: "",
  hotspotType: "",
  priority: "",
  assignee: "",
  dueAt: "",
  location: "",
  latitude: "",
  longitude: "",
  zone: "",
  wasteType: "",
  estimatedWasteKg: "",
  instructions: "",
  internalNotes: "",
  hasReferencePhoto: false,
};

function fromTask(t: Task): TaskFormValues {
  return {
    title: t.title,
    description: t.description,
    hotspotType: t.hotspotType,
    priority: t.priority,
    assignee: t.assignee ?? "",
    dueAt: t.dueAt.slice(0, 10),
    location: t.location,
    latitude: String(t.latitude),
    longitude: String(t.longitude),
    zone: t.zone,
    wasteType: t.wasteType,
    estimatedWasteKg: t.estimatedWasteKg ? String(t.estimatedWasteKg) : "",
    instructions: t.instructions ?? "",
    internalNotes: t.internalNotes ?? "",
    hasReferencePhoto: !!t.hasReferencePhoto,
  };
}

type Errors = Partial<Record<keyof TaskFormValues, string>>;

function validate(v: TaskFormValues): Errors {
  const errors: Errors = {};
  if (!v.title.trim()) errors.title = "Title is required.";
  if (!v.description.trim()) errors.description = "Description is required.";
  if (!v.hotspotType) errors.hotspotType = "Select a hotspot type.";
  if (!v.priority) errors.priority = "Select a priority.";
  if (!v.dueAt) errors.dueAt = "Due date is required.";
  if (!v.zone) errors.zone = "Select a zone.";
  if (!v.location.trim()) errors.location = "Address is required.";
  if (!v.latitude.trim() || Number.isNaN(Number(v.latitude)) || Math.abs(Number(v.latitude)) > 90) {
    errors.latitude = "Enter a valid latitude.";
  }
  if (!v.longitude.trim() || Number.isNaN(Number(v.longitude)) || Math.abs(Number(v.longitude)) > 180) {
    errors.longitude = "Enter a valid longitude.";
  }
  return errors;
}

export function CreateTaskSheet({
  open,
  onOpenChange,
  editingTask,
  collectorOptions,
  zoneNames,
  onCreate,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTask?: Task | null;
  collectorOptions: string[];
  zoneNames: string[];
  onCreate: (input: NewTaskInput) => void;
  onEdit: (taskId: string, patch: Partial<NewTaskInput>) => void;
}) {
  const [values, setValues] = useState<TaskFormValues>(emptyForm);
  const [errors, setErrors] = useState<Errors>({});
  const isEditing = !!editingTask;

  useEffect(() => {
    if (open) {
      setValues(editingTask ? fromTask(editingTask) : emptyForm);
      setErrors({});
    }
  }, [open, editingTask]);

  function set<K extends keyof TaskFormValues>(key: K, value: TaskFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function handleSubmit() {
    const nextErrors = validate(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    const input: NewTaskInput = {
      title: values.title.trim(),
      description: values.description.trim(),
      hotspotType: values.hotspotType as HotspotType,
      priority: values.priority as Priority,
      assignee: values.assignee || undefined,
      dueAt: `${values.dueAt} 18:00`,
      location: values.location.trim(),
      latitude: Number(values.latitude),
      longitude: Number(values.longitude),
      zone: values.zone as Zone,
      wasteType: (values.wasteType || "Mixed Municipal") as WasteType,
      estimatedWasteKg: values.estimatedWasteKg ? Number(values.estimatedWasteKg) : undefined,
      instructions: values.instructions.trim() || undefined,
      internalNotes: values.internalNotes.trim() || undefined,
      hasReferencePhoto: values.hasReferencePhoto,
    };
    if (isEditing && editingTask) {
      onEdit(editingTask.id, input);
    } else {
      onCreate(input);
    }
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" onOpenChange={onOpenChange} className="w-full overflow-x-hidden overflow-y-auto sm:max-w-[40rem]">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Task" : "Create Task"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Update the details for this cleanup task." : "A task can be saved as a draft without a collector assigned."}
          </SheetDescription>
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-border/70 pt-4" aria-label="Task form sections">
            {[
              ["1", "Details"], ["2", "Assignment"], ["3", "Location"], ["4", "Notes"],
            ].map(([number, label]) => (
              <div key={number} className="form-progress-step">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px] text-primary">{number}</span>
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </SheetHeader>

        <div className="space-y-7 px-5 py-5 sm:px-6">
          <section className="sheet-section space-y-3">
            <h3 className="section-label">Task details</h3>
            <Field label="Title" error={errors.title} required>
              <Input value={values.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Plastic dump near lake" />
            </Field>
            <Field label="Description" error={errors.description} required>
              <Textarea value={values.description} onChange={(e) => set("description", e.target.value)} placeholder="What needs to be cleaned up?" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hotspot type" error={errors.hotspotType} required>
                <Select value={values.hotspotType} onValueChange={(v) => set("hotspotType", v as HotspotType)}>
                  <SelectTrigger><SelectValue placeholder={values.hotspotType || "Select type"} /></SelectTrigger>
                  <SelectContent>
                    {HOTSPOT_TYPES.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Priority" error={errors.priority} required>
                <Select value={values.priority} onValueChange={(v) => set("priority", v as Priority)}>
                  <SelectTrigger><SelectValue placeholder={values.priority ? values.priority[0].toUpperCase() + values.priority.slice(1) : "Select priority"} /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Waste type">
                <Select value={values.wasteType} onValueChange={(v) => set("wasteType", v as WasteType)}>
                  <SelectTrigger><SelectValue placeholder={values.wasteType || "Select waste type"} /></SelectTrigger>
                  <SelectContent>
                    {WASTE_TYPES.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Estimated quantity (kg)">
                <Input type="number" min={0} value={values.estimatedWasteKg} onChange={(e) => set("estimatedWasteKg", e.target.value)} placeholder="Optional" />
              </Field>
            </div>
          </section>

          <section className="sheet-section space-y-3">
            <h3 className="section-label">Assignment &amp; timing</h3>
            <Field label="Assigned collector" hint="Leave blank to save as a draft — you can assign later.">
              <Select value={values.assignee || "__none"} onValueChange={(v) => set("assignee", v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder={values.assignee || "No collector (draft)"} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">No collector (draft)</SelectItem>
                  {collectorOptions.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">No active collectors available</div>
                  ) : collectorOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Due date" error={errors.dueAt} required>
                <Input type="date" value={values.dueAt} onChange={(e) => set("dueAt", e.target.value)} />
              </Field>
              <Field label="Zone" error={errors.zone} required>
                <Select value={values.zone} onValueChange={(v) => set("zone", v as Zone)}>
                  <SelectTrigger><SelectValue placeholder={values.zone || "Select zone"} /></SelectTrigger>
                  <SelectContent>
                    {zoneNames.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <section className="sheet-section space-y-3">
            <h3 className="section-label">Location</h3>
            <Field label="Address" error={errors.location} required>
              <Input value={values.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. MG Road, Ward 12" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Latitude" error={errors.latitude} required>
                <Input value={values.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="12.9756" />
              </Field>
              <Field label="Longitude" error={errors.longitude} required>
                <Input value={values.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="77.6068" />
              </Field>
            </div>
          </section>

          <section className="sheet-section space-y-3">
            <h3 className="section-label">Optional details</h3>
            <Field label="Instructions">
              <Textarea value={values.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="Any special handling notes for the collector" />
            </Field>
            <Field label="Internal notes">
              <Textarea value={values.internalNotes} onChange={(e) => set("internalNotes", e.target.value)} placeholder="Visible to operators only" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox checked={values.hasReferencePhoto} onCheckedChange={(v: boolean) => set("hasReferencePhoto", !!v)} />
              Reference photo attached (mock placeholder)
            </label>
          </section>
        </div>

        <SheetFooter className="sticky bottom-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="dashboard-primary-action" onClick={handleSubmit}>{isEditing ? "Save changes" : "Create task"}</Button>
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
      <Label className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
