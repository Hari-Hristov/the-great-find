import { createFileRoute } from "@tanstack/react-router";
import { OverviewPage } from "@/pages/dashboard/OverviewPage";

export const Route = createFileRoute("/dashboard/")({
  component: OverviewPage,
});
