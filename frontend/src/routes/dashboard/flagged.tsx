import { createFileRoute } from "@tanstack/react-router";
import { FlaggedPage } from "@/pages/dashboard/FlaggedPage";

export const Route = createFileRoute("/dashboard/flagged")({
  component: FlaggedPage,
});
