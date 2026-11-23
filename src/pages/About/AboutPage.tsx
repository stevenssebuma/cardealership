import { AboutSection } from "../Home/components/AboutSection";

/**
 * Standalone /about page.
 *
 * The showroom story already exists as the home page's AboutSection; this page
 * gives that content a real URL and one page-level heading, so the route is
 * linkable instead of only reachable by scrolling.
 */
export function AboutPage() {
  return (
    <main className="pt-20">
      <section className="px-6 pt-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-bold md:text-5xl">ABOUT PANDA MOTORS</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Panda Motors Ltd imports vehicles from Japan, the UK and the UAE,
            clears them through URA and registers them with UNRA for customers
            across Uganda. The showroom is in Banda, on Jinja Road.
          </p>
        </div>
      </section>

      <AboutSection />
    </main>
  );
}
