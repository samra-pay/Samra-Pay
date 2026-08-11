import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Menu, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SamraLogo } from "@/components/samra-logo";

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const focusableSelector = 'a[href], button:not([disabled])';
    requestAnimationFrame(() => {
      mobileMenuRef.current?.querySelector<HTMLElement>(focusableSelector)?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
        menuButtonRef.current?.focus();
        return;
      }

      if (event.key === "Tab" && mobileMenuRef.current) {
        const focusable = Array.from(
          mobileMenuRef.current.querySelectorAll<HTMLElement>(focusableSelector),
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!first || !last) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  const navLinks = [
    { href: "/cards", label: "Cards" },
    { href: "/remittance", label: "Remittance" },
    { href: "/social-house", label: "Tomoca Social House" },
    { href: "/ask-samra", label: "Ask Samra" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b border-transparent",
        isScrolled
          ? "bg-background/80 backdrop-blur-md border-white/5 py-4"
          : "bg-transparent py-6"
      )}
    >
      <div className="container mx-auto px-6 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Samra Pay home"
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
        >
          <SamraLogo size="md" showWordmark={true} />
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8" aria-label="Primary navigation">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} aria-current={location === link.href ? "page" : undefined}>
              <span
                className={cn(
                  "rounded-sm text-sm tracking-wide transition-colors cursor-pointer hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background",
                  location === link.href ? "text-primary font-medium" : "text-foreground/80"
                )}
              >
                {link.label}
              </span>
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-4">
          <Link href="/login">
            <span className="text-sm font-medium hover:text-primary transition-colors cursor-pointer text-foreground/80">
              Sign In
            </span>
          </Link>
          <Button asChild variant="gold" className="rounded-full px-6 font-medium">
            <Link href="/login">
              Apply Now
            </Link>
          </Button>
        </div>

        {/* Mobile Toggle */}
        <button
          ref={menuButtonRef}
          type="button"
          className="md:hidden inline-flex size-11 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-white/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          aria-label={isMobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-navigation"
        >
          {isMobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div
          id="mobile-navigation"
          ref={mobileMenuRef}
          className="md:hidden absolute top-full left-0 right-0 bg-background/95 backdrop-blur-xl border-b border-white/10 p-6 flex flex-col gap-6 shadow-2xl"
          aria-label="Mobile navigation"
        >
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={location === link.href ? "page" : undefined}
              className="block rounded-sm text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <div className="flex flex-col gap-4 pt-4 border-t border-white/10">
            <Link
              href="/login"
              className="block rounded-sm text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Sign In
            </Link>
            <Button asChild variant="gold" className="w-full rounded-full" onClick={() => setIsMobileMenuOpen(false)}>
              <Link href="/login">
                Apply Now
              </Link>
            </Button>
          </div>
        </div>
      )}
    </header>
  );
}
