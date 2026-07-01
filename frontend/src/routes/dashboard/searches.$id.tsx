import { createFileRoute } from "@tanstack/react-router";
import { SearchDetailPage } from "@/pages/dashboard/SearchDetailPage";

export const Route = createFileRoute("/dashboard/searches/$id")({
  component: SearchDetailPage,
});
