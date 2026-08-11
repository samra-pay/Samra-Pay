import { Link } from "wouter";
import { SamraLogo } from "@/components/samra-logo";

export function Footer() {
  return (
    <footer className="border-t border-white/5 bg-background pt-20 pb-10">
      <div className="container mx-auto px-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-2">
            <Link
              href="/"
              aria-label="Samra Pay home"
              className="mb-6 inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
            >
              <SamraLogo size="md" showWordmark={true} />
            </Link>
            <p className="text-muted-foreground max-w-sm text-sm leading-relaxed mb-6">
              A modern financial platform for the Ethiopian diaspora. Built to honor our heritage while securing our future.
            </p>
            <div className="flex gap-4 text-sm font-serif text-primary/60 italic">
              <span lang="am">ሳምራ</span>
              <span className="w-1 h-1 rounded-full bg-primary/40 self-center" aria-hidden="true" />
              <span lang="am">ቡና</span>
            </div>
          </div>
          
          <div>
            <h4 className="font-medium mb-6 text-sm tracking-wider uppercase text-foreground/80">Products</h4>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li>
                <Link href="/cards/charge"><span className="hover:text-primary transition-colors cursor-pointer">Samra Pay Charge Card</span></Link>
              </li>
              <li>
                <Link href="/cards/co-brand"><span className="hover:text-primary transition-colors cursor-pointer">Airlines Co-brand</span></Link>
              </li>
              <li>
                <Link href="/cards"><span className="hover:text-primary transition-colors cursor-pointer">Compare Cards</span></Link>
              </li>
              <li>
                <Link href="/remittance"><span className="hover:text-primary transition-colors cursor-pointer">Remittance</span></Link>
              </li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-6 text-sm tracking-wider uppercase text-foreground/80">Company</h4>
            <ul className="space-y-4 text-sm text-muted-foreground">
              <li>
                <Link href="/social-house"><span className="hover:text-primary transition-colors cursor-pointer">Tomoca Social House</span></Link>
              </li>
              <li>
                <Link href="/ask-samra"><span className="hover:text-primary transition-colors cursor-pointer">Ask Samra</span></Link>
              </li>
              <li>
                <Link href="/"><span className="hover:text-primary transition-colors cursor-pointer">About Us</span></Link>
              </li>
              <li>
                <Link href="/login"><span className="hover:text-primary transition-colors cursor-pointer">Sign In</span></Link>
              </li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Samra Pay, Inc. All rights reserved.</p>
          <div className="flex gap-6">
            <Link
              href="/privacy"
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Terms of Service
            </Link>
          </div>
        </div>
        
        <div id="legal-disclosures" className="mt-8 text-xs text-muted-foreground/70 leading-relaxed text-center max-w-4xl mx-auto">
          Samra Pay is a financial technology company, not a bank. Banking services are provided by partner banks, each a Member FDIC. Card programs are issued on the Mastercard network pursuant to a license from Mastercard International; acceptance varies by merchant and country.
        </div>
      </div>
    </footer>
  );
}
