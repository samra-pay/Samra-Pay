import { createRoot } from "react-dom/client";
import { PublicAnalyticsConsent } from "./components/public-analytics-consent";
import { PublicLanguageProvider } from "./lib/public-i18n";
import { loadPublicPage } from "./lib/public-page-loader";
import { resolvePublicRoute } from "./lib/public-routes";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

function scrollToCurrentHash() {
  const rawHash = window.location.hash.slice(1);
  if (!rawHash) return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const target = document.getElementById(decodeURIComponent(rawHash));
      if (!target) return;
      target.scrollIntoView({ block: "start" });
      if (target.id === "main-content") {
        target.focus({ preventScroll: true });
      }
    });
  });
}

async function bootstrapPublicSite() {
  const route = resolvePublicRoute(
    window.location.pathname,
    import.meta.env.BASE_URL,
  );
  const { default: PublicPage } = await loadPublicPage(route);

  createRoot(rootElement!).render(
    <PublicLanguageProvider>
      <PublicPage />
      <PublicAnalyticsConsent
        showPrompt={!!route && route !== "login" && route !== "signup"}
      />
    </PublicLanguageProvider>,
  );

  scrollToCurrentHash();
}

window.addEventListener("hashchange", scrollToCurrentHash);
void bootstrapPublicSite();
