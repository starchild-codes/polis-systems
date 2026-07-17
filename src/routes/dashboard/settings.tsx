import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/settings")({
  component: () => <Navigate to="/settings" replace />,
});
