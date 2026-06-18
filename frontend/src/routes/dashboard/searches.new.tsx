import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { SearchForm } from "@/components/SearchForm";

export const Route = createFileRoute("/dashboard/searches/new")({
  component: NewSearchPage,
});

function NewSearchPage() {
  const navigate = useNavigate();
  const goBack = () => navigate({ to: "/dashboard/searches" });

  return (
    <>
      <Topbar title="New search" subtitle="Create a saved olx.bg query for the scheduler to monitor" />

      <div className="flex-1 overflow-auto px-6 py-6">
        <Card className="mx-auto max-w-3xl">
          <CardContent className="p-5">
            <SearchForm mode="create" onSuccess={goBack} onCancel={goBack} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
