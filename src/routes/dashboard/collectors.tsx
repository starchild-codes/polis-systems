import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/collectors")({
  component: () => <Navigate to="/collectors" replace />,
});
