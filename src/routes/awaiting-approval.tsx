import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/awaiting-approval")({
  component: () => <Navigate to="/overview" replace />,
});
