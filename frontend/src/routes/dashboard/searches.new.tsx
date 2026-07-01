import { createFileRoute } from "@tanstack/react-router";
import { NewSearchPage } from "@/pages/dashboard/NewSearchPage";

export const Route = createFileRoute("/dashboard/searches/new")({
  component: NewSearchPage,
});
