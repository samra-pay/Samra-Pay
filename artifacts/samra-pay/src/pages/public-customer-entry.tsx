import { CustomerEntryPanel } from "@/components/customer-entry-panel";
import { configuredCustomerLinks } from "@/lib/public-customer-entry";
import { normalizePublicPath } from "@/lib/public-routes";
import { localized, usePublicLanguage } from "@/lib/public-i18n";

export default function PublicCustomerEntry() {
  const { text } = usePublicLanguage();
  const signup =
    normalizePublicPath(window.location.pathname, import.meta.env.BASE_URL) ===
    "/signup";
  const links = configuredCustomerLinks();
  const base = import.meta.env.BASE_URL;
  return (
    <CustomerEntryPanel
      signup={signup}
      homeHref={base}
      alternateHref={`${base}${signup ? "login" : "signup"}`}
    >
      {links ? (
        <>
          <a
            className="customer-entry-primary"
            href={signup ? links.signup : links.login}
            referrerPolicy="no-referrer"
          >
            {signup
              ? text(localized("Create account", "መለያ ይፍጠሩ"))
              : text(localized("Log in", "ይግቡ"))}
          </a>
          <p className="customer-entry-note">
            {text(
              localized(
                "Continue to Samra Pay’s secure account service.",
                "ወደ Samra Pay የደህንነት መለያ አገልግሎት ይቀጥሉ።",
              ),
            )}
          </p>
        </>
      ) : (
        <>
          <p role="status">
            {text(
              localized(
                "Account access is not open yet. Get launch updates and we’ll keep you informed.",
                "የመለያ መዳረሻ ገና አልተከፈተም። የምረቃ ዜና ያግኙና መረጃ እናደርስዎታለን።",
              ),
            )}
          </p>
          <a className="customer-entry-primary" href={`${base}#launch-updates`}>
            {text(localized("Get launch updates", "የምረቃ ዜና ያግኙ"))}
          </a>
        </>
      )}
    </CustomerEntryPanel>
  );
}
