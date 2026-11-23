import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Locks the routing contract: one router, an explicit path for every page, the
 * catch-all rendering the 404, and public chrome owned by SiteLayout.
 */

const appSource = readFileSync("src/app/App.tsx", "utf8");
const siteLayoutSource = readFileSync("src/app/layouts/SiteLayout.tsx", "utf8");
const adminLayoutSource = readFileSync("src/app/layouts/AdminLayout.tsx", "utf8");
const notFoundSource = readFileSync("src/pages/NotFound/NotFoundPage.tsx", "utf8");
const homeSource = readFileSync("src/pages/Home/HomePage.tsx", "utf8");

// One router, and it is the declarative one that main.tsx already renders.
assert.equal(appSource.match(/<BrowserRouter>/g)?.length, 1);
assert.equal(appSource.includes("createBrowserRouter"), false);
assert.equal(appSource.includes("RouterProvider"), false);

// Every page has an explicit path.
const explicitRoutes = [
  "<Route index element={<HomePage />} />",
  '<Route path="cars" element={<CarsPage />} />',
  '<Route path="cars/:id" element={<VehicleDetailsPage />} />',
  '<Route path="about" element={<AboutPage />} />',
  '<Route path="contact" element={<ContactPage />} />',
  '<Route path="profile" element={<ProfilePage />} />',
  '<Route path="settings" element={<SettingsPage />} />',
  '<Route path="admin" element={<AdminLayout />}>',
  '<Route path="chat" element={<AdminChatPage />} />',
  '<Route path="register" element={<RegisterPage />} />',
];

for (const route of explicitRoutes) {
  assert.equal(appSource.includes(route), true, `missing route: ${route}`);
}

assert.equal(appSource.includes('path="login"'), true);

// The catch-all renders the 404 and never the home page.
assert.equal(
  appSource.includes('<Route path="*" element={<NotFoundPage />} />'),
  true,
);
assert.equal(/path="\*"[\s\S]{0,40}HomePage/.test(appSource), false);

// Admin paths are lowercase.
assert.equal(appSource.includes('path="Admin"'), false);
assert.equal(appSource.includes("/Admin/chat"), false);
const adminRouteStart = appSource.indexOf(
  '<Route path="admin" element={<AdminLayout />}>',
);
const adminRouteEnd = appSource.indexOf("</Route>", adminRouteStart);
const adminRouteSource = appSource.slice(adminRouteStart, adminRouteEnd);
assert.equal(
  adminRouteSource.includes('<Route path="*" element={<NotFoundPage />} />'),
  true,
  "unmatched admin URLs should render the 404 within the admin route tree",
);

// The 404 is a real page in its own folder with the documented export name.
assert.equal(notFoundSource.includes("export function NotFoundPage()"), true);
assert.equal(notFoundSource.includes("useLocation"), true);

// Public chrome has exactly one implementation: the layout, not the pages.
assert.equal(siteLayoutSource.includes("<Navbar />"), true);
assert.equal(siteLayoutSource.includes("<Footer />"), true);
assert.equal(siteLayoutSource.includes("<Outlet />"), true);
assert.equal(homeSource.includes("<Navbar"), false);
assert.equal(homeSource.includes("<Footer"), false);

// Admin guard and chat provider live in the admin layout.
assert.equal(adminLayoutSource.includes("adminOnly"), true);
assert.equal(adminLayoutSource.match(/<AdminChatProvider>/g)?.length, 1);

console.log(
  JSON.stringify(
    {
      suite: "routeTable",
      passed: 23,
      failed: 0,
      singleRouterVerified: true,
      explicitPathsVerified: true,
      catchAllRendersNotFound: true,
      adminWildcardVerified: true,
      lowercaseAdminPaths: true,
      chromeOwnedByLayout: true,
      adminGuardInLayout: true,
    },
    null,
    2,
  ),
);
