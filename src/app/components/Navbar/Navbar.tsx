import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar as SiteNavbar } from "../../../components/common/Navbar/Navbar";

/**
 * Home page header.
 *
 * The brand block lives here while the navigation links, the "Book Test Drive"
 * action and the auth-aware account links (SIGN IN / MY PROFILE / SIGN OUT)
 * come from the shared Navbar component, so signing in or out is reflected in
 * the header everywhere the customer goes.
 */
export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="relative flex items-center justify-between h-20">
          <div
            className="flex items-center gap-3 cursor-pointer"
            onClick={() => navigate("/")}
          >
            <div className="w-8 h-8 border-2 border-primary flex items-center justify-center">
              <div className="w-3 h-3 bg-primary" />
            </div>

            <h1 className="text-2xl font-bold">
              <span className="text-primary">PANDA</span>
              <span className="ml-2">MOTORS</span>
            </h1>
          </div>

          <SiteNavbar
            mobileMenuOpen={mobileMenuOpen}
            onToggleMobileMenu={() => setMobileMenuOpen((open) => !open)}
          />
        </div>
      </div>
    </header>
  );
}
