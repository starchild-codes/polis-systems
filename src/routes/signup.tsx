import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [{ title: "Create Account — Polis Systems" }],
  }),
  component: () => <AuthPage mode="signup" />,
});
