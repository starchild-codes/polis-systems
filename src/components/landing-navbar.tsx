import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

function Logo() {
  return (
    <Link to="/" className="focus-ring flex items-center gap-2.5 rounded-xl">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-sm shadow-primary/20">
        P
      </div>
      <span className="text-lg font-semibold tracking-tight text-navy-950">
        Polis <span className="text-primary">Systems</span>
      </span>
    </Link>
  );
}

export function LandingNavbar() {
  const { isAuthorized } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const navLinks = [
    { href: "#about", label: "What we do" },
    { href: "#how-it-works", label: "Workflow" },
    { href: "#capabilities", label: "Capabilities" },
    { href: "#impact", label: "Impact" },
  ];

  return (
    <header
      className={cn(
        "sticky inset-x-0 top-0 z-50 bg-white transition-shadow duration-300 motion-reduce:transition-none",
        scrolled
          ? "border-b border-navy-100 bg-white/95 shadow-sm backdrop-blur-md"
          : "border-b border-transparent",
      )}
    >
      <nav className="mx-auto flex h-[4.5rem] max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
        <Logo />

        {/* Desktop nav */}
        <div className="hidden items-center gap-6 lg:flex">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="focus-ring rounded-lg px-3 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden items-center gap-2 md:flex">
          {isAuthorized && (
            <Link to="/overview" className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white">
              Open dashboard
            </Link>
          )}
          <Link
            to="/login"
            className="focus-ring rounded-lg px-4 py-2 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="focus-ring rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-primary/20 transition-colors hover:bg-primary-dark focus-visible:bg-primary-dark"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="focus-ring rounded-lg p-2 text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white md:hidden"
          aria-label="Toggle menu"
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-navigation"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div id="public-mobile-navigation" className="space-y-2 border-b border-navy-100 bg-white px-4 py-4 shadow-surface animate-fade-in md:hidden">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="focus-ring block rounded-lg px-3 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white"
            >
              {link.label}
            </a>
          ))}
          <div className="flex flex-col gap-2 border-t border-navy-100 pt-3">
            {isAuthorized && (
              <Link to="/overview" className="focus-ring rounded-lg px-3 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white" onClick={() => setMobileOpen(false)}>
                Open dashboard
              </Link>
            )}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="focus-ring rounded-lg px-3 py-2.5 text-sm font-medium text-navy-700 transition-colors hover:bg-primary hover:text-white focus-visible:bg-primary focus-visible:text-white"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="focus-ring rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-dark focus-visible:bg-primary-dark"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
