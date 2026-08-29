import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element was not found.");
}

async function bootstrap() {
  if (window.location.pathname === "/") {
    const { default: Home } = await import("./pages/home");
    createRoot(rootElement!).render(<Home />);
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
      <App />
    </ErrorBoundary>,
  );
}

void bootstrap();
