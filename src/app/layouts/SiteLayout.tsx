import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar/Navbar";
import { Footer } from "../../components/common/Footer/Footer";

/**
 * Chrome for every public page (home, inventory, vehicle detail, about,
 * contact and the 404).
 *
 * The site header is fixed, so each page starts its own content below it
 * (`mt-20` / `pt-20` / `pt-32`) instead of the layout adding an offset that
 * would have to be undone on the pages that open with a full-bleed hero.
 * Pages render their own <main>; this layout only guarantees one header and
 * one footer per route.
 */
export function SiteLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Navbar />
      <div className="flex-1">
        <Outlet />
      </div>
      <Footer />
    </div>
  );
}
