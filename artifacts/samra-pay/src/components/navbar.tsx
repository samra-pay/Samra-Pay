import { Link, useLocation } from "wouter";
import { Button } from "./ui/button";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/cards", label: "Cards" },
    { href: "/remittance", label: "Remittance" },
    { href: "/social-house", label: "Social House" },
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
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer group">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center border border-primary/40 group-hover:bg-primary/30 transition-colors">
              <span className="font-serif text-primary text-xl leading-none">S</span>
            </div>
            <span className="font-serif text-xl tracking-wide font-medium">SAMRA</span>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <span
                className={cn(
                  "text-sm tracking-wide transition-colors cursor-pointer hover:text-primary",
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
          className="md:hidden text-foreground/80 hover:text-primary"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-background border-b border-white/10 p-6 flex flex-col gap-6 shadow-2xl">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href}>
              <span
                className="text-lg block"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </span>
            </Link>
          ))}
          <div className="flex flex-col gap-4 pt-4 border-t border-white/10">
            <Link href="/login">
              <span
                className="text-lg block"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign In
              </span>
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
