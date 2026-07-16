export type TaskStatus = "pending" | "assigned" | "in_progress" | "completed" | "verified";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export type CleanupTask = {
  id: string;
  title: string;
  location: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  createdAt: string;
  completedAt: string | null;
  proofUrl: string | null;
};

export type Collector = {
  id: string;
  name: string;
  phone: string;
  zone: string;
  tasksCompleted: number;
  activeTasks: number;
};

export type Submission = {
  id: string;
  taskId: string;
  collectorName: string;
  submittedAt: string;
  photoCount: number;
  verified: boolean;
};

export const mockTasks: CleanupTask[] = [
  {
    id: "t-001",
    title: "Riverside plastic cleanup — Sector 7",
    location: "Lagos, Nigeria — Ogun River bank",
    status: "verified",
    priority: "high",
    assignee: "Amara Okafor",
    createdAt: "2026-07-10T08:00:00Z",
    completedAt: "2026-07-12T15:30:00Z",
    proofUrl: null,
  },
  {
    id: "t-002",
    title: "Market district waste sweep",
    location: "Accra, Ghana — Makola Market",
    status: "in_progress",
    priority: "medium",
    assignee: "Kwesi Mensah",
    createdAt: "2026-07-13T06:00:00Z",
    completedAt: null,
    proofUrl: null,
  },
  {
    id: "t-003",
    title: "Beach cleanup — Coconut Grove",
    location: "Cape Coast, Ghana",
    status: "completed",
    priority: "urgent",
    assignee: "Ama Serwaa",
    createdAt: "2026-07-14T05:00:00Z",
    completedAt: "2026-07-14T11:00:00Z",
    proofUrl: null,
  },
  {
    id: "t-004",
    title: "Drainage clearing — Mile 12",
    location: "Lagos, Nigeria — Mile 12",
    status: "assigned",
    priority: "high",
    assignee: "Tunde Bakare",
    createdAt: "2026-07-15T07:00:00Z",
    completedAt: null,
    proofUrl: null,
  },
  {
    id: "t-005",
    title: "Community litter collection — Nima",
    location: "Accra, Ghana — Nima",
    status: "pending",
    priority: "low",
    assignee: null,
    createdAt: "2026-07-15T09:00:00Z",
    completedAt: null,
    proofUrl: null,
  },
];

export const mockCollectors: Collector[] = [
  {
    id: "c-001",
    name: "Amara Okafor",
    phone: "+234 803 555 0142",
    zone: "Lagos — Sector 7",
    tasksCompleted: 42,
    activeTasks: 1,
  },
  {
    id: "c-002",
    name: "Kwesi Mensah",
    phone: "+233 244 555 0188",
    zone: "Accra — Makola",
    tasksCompleted: 31,
    activeTasks: 2,
  },
  {
    id: "c-003",
    name: "Ama Serwaa",
    phone: "+233 277 555 0091",
    zone: "Cape Coast",
    tasksCompleted: 58,
    activeTasks: 0,
  },
  {
    id: "c-004",
    name: "Tunde Bakare",
    phone: "+234 805 555 0276",
    zone: "Lagos — Mile 12",
    tasksCompleted: 27,
    activeTasks: 1,
  },
];

export const mockSubmissions: Submission[] = [
  {
    id: "s-001",
    taskId: "t-001",
    collectorName: "Amara Okafor",
    submittedAt: "2026-07-12T15:25:00Z",
    photoCount: 4,
    verified: true,
  },
  {
    id: "s-002",
    taskId: "t-003",
    collectorName: "Ama Serwaa",
    submittedAt: "2026-07-14T10:58:00Z",
    photoCount: 6,
    verified: true,
  },
  {
    id: "s-003",
    taskId: "t-002",
    collectorName: "Kwesi Mensah",
    submittedAt: "2026-07-14T16:30:00Z",
    photoCount: 2,
    verified: false,
  },
];
