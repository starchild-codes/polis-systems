import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-institutional-700 text-white font-bold text-sm">
        P
      </div>
      <span className="font-semibold text-navy-950 text-lg tracking-tight">
        Polis <span className="text-institutional-600">Systems</span>
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
    { href: "#about", label: "About" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "#impact", label: "Impact" },
  ];

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        scrolled
          ? "bg-white/95 backdrop-blur-md border-b border-navy-100 shadow-sm"
          : "bg-transparent",
      )}
    >
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-6 lg:px-8">
        <Logo />

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-navy-600 hover:text-navy-950 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </div>

        {/* Desktop actions */}
        <div className="hidden md:flex items-center gap-3">
          {isAuthorized && (
            <Link to="/overview" className="text-sm font-medium text-primary hover:text-primary-dark px-4 py-2 transition-colors">
              Open dashboard
            </Link>
          )}
          <Link
            to="/login"
            className="text-sm font-medium text-navy-700 hover:text-navy-950 px-4 py-2 transition-colors"
          >
            Log In
          </Link>
          <Link
            to="/signup"
            className="text-sm font-medium text-white bg-institutional-700 hover:bg-institutional-800 px-4 py-2 rounded-lg transition-colors"
          >
            Sign Up
          </Link>
        </div>

        {/* Mobile toggle */}
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="md:hidden p-2 text-navy-700"
          aria-label="Toggle menu"
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
        <div className="md:hidden bg-white border-b border-navy-100 px-4 py-4 space-y-3">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="block text-sm font-medium text-navy-600 hover:text-navy-950"
            >
              {link.label}
            </a>
          ))}
          <div className="pt-3 border-t border-navy-100 flex flex-col gap-2">
            {isAuthorized && (
              <Link to="/overview" className="text-sm font-medium text-primary py-2" onClick={() => setMobileOpen(false)}>
                Open dashboard
              </Link>
            )}
            <Link
              to="/login"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-navy-700 py-2"
            >
              Log In
            </Link>
            <Link
              to="/signup"
              onClick={() => setMobileOpen(false)}
              className="text-sm font-medium text-white bg-institutional-700 px-4 py-2.5 rounded-lg text-center"
            >
              Sign Up
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
