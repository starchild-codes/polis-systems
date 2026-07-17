import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/reports")({
  component: () => <Navigate to="/reports" replace />,
});
