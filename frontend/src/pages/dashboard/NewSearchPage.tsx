import { Topbar } from "@/components/layout/Topbar";
import { Card, CardContent } from "@/components/ui/card";
import { SearchForm } from "@/components/SearchForm";
import { useWindowNav } from "@/contexts/DesktopContext";

export function NewSearchPage() {
  const nav = useWindowNav("searches");
  const goBack = () => nav.pop();

  return (
    <>
      <Topbar
        title="New search"
        subtitle="Create a saved olx.bg query for the scheduler to monitor"
        back={{ onClick: goBack, label: "Back to searches" }}
      />

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
