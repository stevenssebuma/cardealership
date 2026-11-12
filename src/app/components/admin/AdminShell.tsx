import type { ReactNode } from "react";
import { Navbar } from "../Navbar/Navbar";

/**
 * Chrome shared by every staff console screen.
 *
 * The profile page owns the app's signed-in look (see `.profile-page` and
 * `.profile-page--with-header` in `src/styles/index.css`), so the admin routes
 * reuse the same surface and site header through this shell instead of keeping
 * their own light-styled page frames.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <main className="profile-page profile-page--with-header admin-page">
        {children}
      </main>
    </>
  );
}
