/**
 * AdminDashboard
 *
 * Purpose:
 * Private admin dashboard entry component for dealership managers.
 *
 * Planned responsibilities:
 * - Check admin access before showing inventory controls.
 * - Render the admin listings table.
 * - Keep dashboard UI separate from the customer marketplace flow.
 *
 * Implementation phase:
 * Phase 10 will add the admin/route guard behavior.
 * Phase 11 will add the inventory listings table.
 */

export function AdminDashboard() {
  return (
    <section className="py-24 px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="mb-10">
          <p className="text-primary text-sm font-bold tracking-[0.3em] mb-4 uppercase">
            Admin
          </p>

          <h3 className="text-5xl md:text-6xl font-bold mb-4">
            INVENTORY CONTROL PANEL
          </h3>

          <p className="text-muted-foreground text-lg">
            Admin dashboard planning stub. Route guard and inventory table will
            be added in the next phases.
          </p>
        </div>
      </div>
    </section>
  );
}
