import { createFileRoute } from "@tanstack/react-router";
import { AlertDetailPage } from "@/pages/dashboard/AlertDetailPage";

export const Route = createFileRoute("/dashboard/alerts/$searchId")({
  component: AlertDetailPage,
});
