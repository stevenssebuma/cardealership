import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { scrollToSection } from "@/hooks/useScrollToSection";
import { Link, useLocation, useNavigate } from "react-router";
import { useAuth } from "@/features/auth/hooks";

interface NavbarProps {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

const navItems = [
  { label: "INVENTORY", section: "inventory" },
  { label: "SERVICES", section: "services" },
  { label: "ABOUT", section: "about" },
  { label: "CONTACT", section: "contact" },
] as const;

const TEST_DRIVE_SECTION = "test-drive";

/**
 * Auth-aware account links, so a signed-in customer can always reach the
 * profile page the account routes expose.
 */
function AccountLinks({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const { isAuthenticated, user, logout } = useAuth();
  const navigate = useNavigate();
  const linkClassName = mobile
    ? "block text-sm font-medium hover:text-primary transition-colors"
    : "text-sm font-medium hover:text-primary transition-colors";

  if (!isAuthenticated) {
    return (
      <Link to="/login" className={linkClassName} onClick={onNavigate}>
        SIGN IN
      </Link>
    );
  }

  const isAdmin = user?.role === "admin";

  return (
    <>
      <Link
        to={isAdmin ? "/Admin" : "/profile"}
        className={linkClassName}
        onClick={onNavigate}
      >
        {isAdmin ? "ADMIN" : "MY PROFILE"}
      </Link>
      <button
        type="button"
        className={linkClassName}
        onClick={() => {
          logout();
          onNavigate?.();
          navigate("/");
        }}
      >
        SIGN OUT
      </button>
    </>
  );
}

export function Navbar({ mobileMenuOpen, onToggleMobileMenu }: NavbarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === "/";

  const closeMobileMenuIfOpen = () => {
    if (mobileMenuOpen) {
      onToggleMobileMenu();
    }
  };

  const handleNavClick = (section: string) => {
    closeMobileMenuIfOpen();
    if (isHome) {
      scrollToSection(section);
      return;
    }
    // Any other route renders the home page, so a hash navigation brings the
    // customer back to the requested section without a full page reload.
    navigate(`/#${section}`);
  };

  return (
    <>
      <nav className="hidden lg:flex items-center space-x-6">
        {navItems.map((item) => (
          <button
            key={item.section}
            type="button"
            onClick={() => handleNavClick(item.section)}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {item.label}
          </button>
        ))}
        <Button
          className="bg-primary text-white hover:bg-primary/90"
          onClick={() => handleNavClick(TEST_DRIVE_SECTION)}
        >
          BOOK TEST DRIVE
        </Button>
        <AccountLinks />
      </nav>

      <button className="lg:hidden p-2" onClick={onToggleMobileMenu} aria-label="Toggle navigation menu">
        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-20 left-0 right-0 bg-background border-b border-border px-6 py-4 space-y-4">
          {navItems.map((item) => (
            <button
              key={item.section}
              type="button"
              onClick={() => handleNavClick(item.section)}
              className="block w-full text-left text-sm font-medium hover:text-primary transition-colors"
            >
              {item.label}
            </button>
          ))}
          <Button
            className="w-full bg-primary text-white hover:bg-primary/90"
            onClick={() => handleNavClick(TEST_DRIVE_SECTION)}
          >
            BOOK TEST DRIVE
          </Button>
          <AccountLinks mobile onNavigate={closeMobileMenuIfOpen} />
        </div>
      )}
    </>
  );
}

