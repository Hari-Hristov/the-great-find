import { createFileRoute } from "@tanstack/react-router";
import { SearchAnalyticsPage } from "@/pages/dashboard/SearchAnalyticsPage";

export const Route = createFileRoute("/dashboard/searches/$id/analytics")({
  component: SearchAnalyticsPage,
});
