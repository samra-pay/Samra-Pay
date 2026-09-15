import { useEffect } from "react";
import { useLocation } from "wouter";
import { useCustomerAccount } from "@/lib/customer-account";
import { customerSessionDestination } from "@/lib/customer-entry";
import { useCustomerAuth } from "@/lib/customer-auth";
import { localized, usePublicLanguage } from "@/lib/public-i18n";
import "@/components/customer-entry.css";
import "./coming-soon.css";

export default function CustomerSession() {
  const customer = useCustomerAccount();
  const auth = useCustomerAuth();
  const [, setLocation] = useLocation();
  const { text } = usePublicLanguage();
  // Do not route using cached customer data while revalidating the session.
  const destination =
    customer.isPending || customer.isFetching
      ? null
      : customerSessionDestination(customer.data, customer.error);
  useEffect(() => {
    if (destination) setLocation(destination, { replace: true });
  }, [destination, setLocation]);
  return (
    <main className="coming-soon-site">
      <section className="customer-entry-status" aria-live="polite">
        {!customer.isPending && !destination && !customer.isFetching ? (
          <>
            <h1>
              {text(
                localized("We couldn’t open your account", "መለያዎን መክፈት አልቻልንም"),
              )}
            </h1>
            <p role="alert">
              {text(
                localized(
                  "Try again. If access remains unavailable, contact support.",
                  "እንደገና ይሞክሩ። መዳረሻ ካልተገኘ ድጋፍ ያግኙ።",
                ),
              )}
            </p>
            <button
              className="customer-entry-primary"
              onClick={() => void customer.refetch()}
            >
              {text(localized("Try again", "እንደገና ይሞክሩ"))}
            </button>
            <button onClick={() => void auth.signOut()}>
              {text(localized("Log out", "ውጡ"))}
            </button>
          </>
        ) : (
          <p role="status">
            {text(localized("Checking your account…", "መለያዎን በመፈተሽ ላይ…"))}
          </p>
        )}
      </section>
    </main>
  );
}
