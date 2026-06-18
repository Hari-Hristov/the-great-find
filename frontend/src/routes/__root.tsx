import { Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { EventStreamProvider } from "@/contexts/EventStreamContext";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <ThemeProvider>
      <EventStreamProvider>
        <Outlet />
      </EventStreamProvider>
    </ThemeProvider>
  );
}
