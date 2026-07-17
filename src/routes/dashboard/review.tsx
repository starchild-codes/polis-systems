import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/review")({
  component: () => <Navigate to="/review" replace />,
});
