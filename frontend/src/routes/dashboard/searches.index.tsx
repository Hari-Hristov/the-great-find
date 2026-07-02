import { createFileRoute } from "@tanstack/react-router";
import { SearchesPage } from "@/pages/dashboard/SearchesPage";

export const Route = createFileRoute("/dashboard/searches/")({
  component: SearchesPage,
});
