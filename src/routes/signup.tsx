import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/signup")({
  component: () => <Navigate to="/login" search={{ mode: "signup" }} />,
});
