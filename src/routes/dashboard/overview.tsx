import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/overview")({
  component: () => <Navigate to="/overview" replace />,
});
