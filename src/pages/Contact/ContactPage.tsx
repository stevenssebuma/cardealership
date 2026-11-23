import { ContactSection } from "../Home/components/ContactSection";

/**
 * Standalone /contact page.
 *
 * Reuses the enquiry form and showroom details from the home page so address,
 * phone and opening hours have exactly one implementation.
 */
export function ContactPage() {
  return (
    <main className="pt-20">
      <section className="px-6 pt-16 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <h1 className="text-4xl font-bold md:text-5xl">CONTACT THE SHOWROOM</h1>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Call, message or send an enquiry below. Consultants reply within 30
            minutes during opening hours.
          </p>
        </div>
      </section>

      <ContactSection />
    </main>
  );
}
