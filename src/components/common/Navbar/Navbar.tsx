import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router";
import { useAuth } from "@/features/auth/hooks";

interface NavbarProps {
  mobileMenuOpen: boolean;
  onToggleMobileMenu: () => void;
}

/**
 * Site navigation. Each item now points at the route that actually serves it:
 * inventory and the About/Contact pages are real URLs, while services and the
 * test-drive form remain sections of the home page.
 */
const navItems = [
  { label: "INVENTORY", to: "/cars" },
  { label: "SERVICES", to: "/#services" },
  { label: "ABOUT", to: "/about" },
  { label: "CONTACT", to: "/contact" },
] as const;

const TEST_DRIVE_PATH = "/#test-drive";

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
        to={isAdmin ? "/admin" : "/profile"}
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
  const closeMobileMenuIfOpen = () => {
    if (mobileMenuOpen) {
      onToggleMobileMenu();
    }
  };

  return (
    <>
      <nav className="hidden lg:flex items-center space-x-6">
        {navItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            className="text-sm font-medium hover:text-primary transition-colors"
          >
            {item.label}
          </Link>
        ))}
        <Button
          asChild
          className="bg-primary text-white hover:bg-primary/90"
        >
          <Link to={TEST_DRIVE_PATH}>BOOK TEST DRIVE</Link>
        </Button>
        <AccountLinks />
      </nav>

      <button className="lg:hidden p-2" onClick={onToggleMobileMenu} aria-label="Toggle navigation menu">
        {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      {mobileMenuOpen && (
        <div className="lg:hidden absolute top-20 left-0 right-0 bg-background border-b border-border px-6 py-4 space-y-4">
          {navItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={closeMobileMenuIfOpen}
              className="block w-full text-left text-sm font-medium hover:text-primary transition-colors"
            >
              {item.label}
            </Link>
          ))}
          <Button asChild className="w-full bg-primary text-white hover:bg-primary/90">
            <Link to={TEST_DRIVE_PATH} onClick={closeMobileMenuIfOpen}>
              BOOK TEST DRIVE
            </Link>
          </Button>
          <AccountLinks mobile onNavigate={closeMobileMenuIfOpen} />
        </div>
      )}
    </>
  );
}
