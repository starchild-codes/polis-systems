import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/tasks")({
  component: () => <Navigate to="/tasks" replace />,
});
