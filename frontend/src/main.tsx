import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter, createHashHistory } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { initApiBaseUrl } from "./api/client";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// In packaged Electron the renderer is loaded from a file:// URL. The default
// browser history reads window.location.pathname, which becomes the full
// filesystem path (e.g. /C:/Users/.../index.html) instead of "/", so no
// route ever matches and TanStack Router renders "Not Found". Hash history
// reads window.location.hash instead, which starts as "#/" and matches the
// root route correctly. In dev (http://localhost:5173) we keep browser
// history so the URL bar stays human-readable.
const history =
  window.location.protocol === "file:" ? createHashHistory() : undefined;

const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: "intent",
  ...(history ? { history } : {}),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("#root not found");

// Resolve the API base URL BEFORE mounting the router so the first useQuery
// doesn't race with a placeholder baseUrl. In browser-only dev this is a
// no-op and resolves immediately.
void initApiBaseUrl().finally(() => {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </React.StrictMode>,
  );
});
