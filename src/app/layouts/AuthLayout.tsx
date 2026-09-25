import type { ReactNode } from "react";
import { Outlet, Link } from "react-router";
import { HeaderBrand } from "@/components/common/Header/Header";

/**
 * Shared chrome for the public account screens (sign in / register).
 *
 * Renders `children` when provided and falls back to the router <Outlet /> so
 * the layout can be used either as a route layout or around a single page.
 */
export function AuthLayout({ children }: { children?: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <header className="border-b border-border py-6 px-6">
        <Link to="/" className="inline-block">
          <HeaderBrand />
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md border border-border rounded-lg bg-card p-8">
          {children ?? <Outlet />}
        </div>
      </main>
    </div>
  );
}
