import { createRoot } from "react-dom/client";
import { PublicLanguageProvider } from "./lib/public-i18n";
import { loadKnownPublicPage } from "./lib/public-page-loader";
import { resolvePublicRoute } from "./lib/public-routes";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

async function bootstrapLegacySite() {
  const route = resolvePublicRoute(
    window.location.pathname,
    import.meta.env.BASE_URL,
  );
  const publicPage = loadKnownPublicPage(route);

  if (publicPage) {
    const { default: PublicPage } = await publicPage;
    createRoot(rootElement!).render(
      <PublicLanguageProvider>
        <PublicPage />
      </PublicLanguageProvider>,
    );
    return;
  }

  const [{ default: App }, { ErrorBoundary }] = await Promise.all([
    import("./App"),
    import("@/components/error-boundary"),
    import("./index.css"),
  ]);

  createRoot(rootElement!, {
    onCaughtError: (error, errorInfo) => {
      console.error(error, errorInfo.componentStack);
    },
  }).render(
    <ErrorBoundary>
      <PublicLanguageProvider>
        <App />
      </PublicLanguageProvider>
    </ErrorBoundary>,
  );
}

void bootstrapLegacySite();
