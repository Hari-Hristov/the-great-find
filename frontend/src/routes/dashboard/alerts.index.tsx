import { createFileRoute } from "@tanstack/react-router";
import { AlertsPage } from "@/pages/dashboard/AlertsPage";

export const Route = createFileRoute("/dashboard/alerts/")({
  component: AlertsPage,
});
