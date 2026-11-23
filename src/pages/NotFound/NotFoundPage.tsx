import { Link, useLocation } from "react-router-dom";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./NotFoundPage.css";

/**
 * Route-miss page. Renders inside SiteLayout, so the header and footer come
 * from the layout and this file only owns the page body.
 *
 * The requested address is shown as real text (not stencilled artwork only),
 * because the address is the one fact the visitor needs to recognise.
 */
export function NotFoundPage() {
  const { pathname, search } = useLocation();
  const requestedAddress = `${pathname}${search}`;

  return (
    <main className="not-found">
      <div className="not-found__inner">
        <div className="not-found__copy">
          <h1 className="not-found__title">This address is not on our lot</h1>
          <p className="not-found__body">
            No page is served at the address below. It may have moved, or the
            link may be mistyped.
          </p>

          <Button asChild className="not-found__cta">
            <Link to="/cars">
              Browse stock
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>

          <nav
            className="not-found__links"
            aria-label="Other ways into the showroom"
          >
            <Link className="not-found__link" to="/#test-drive">
              Book a test drive
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link className="not-found__link" to="/about">
              About
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <Link className="not-found__link" to="/contact">
              Contact
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
          </nav>
        </div>

        <div className="not-found__bay">
          <div className="not-found__bay-frame">
            <span className="not-found__bay-plate" aria-hidden="true" />
            <span
              className="not-found__bay-stop not-found__bay-stop--left"
              aria-hidden="true"
            />
            <span
              className="not-found__bay-stop not-found__bay-stop--right"
              aria-hidden="true"
            />

            <p className="not-found__path-well">
              <span className="not-found__path-label">Requested address</span>
              <code className="not-found__path" title={requestedAddress}>
                {requestedAddress}
              </code>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
