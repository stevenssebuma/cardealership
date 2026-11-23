import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/auth";
import { AdminLayout } from "./layouts/AdminLayout";
import { SiteLayout } from "./layouts/SiteLayout";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "./components/auth/PublicOnlyRoute";
import { HashScrollHandler } from "./providers/HashScrollHandler";
import { AboutPage } from "../pages/About/AboutPage";
import { ContactPage } from "../pages/Contact/ContactPage";
import { NotFoundPage } from "../pages/NotFound/NotFoundPage";
import { LoginPage } from "../pages/Login/LoginPage";
import { RegisterPage } from "../pages/Register/RegisterPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import AdminPage from "../pages/Admin/AdminPage";
import { AdminChatPage } from "../pages/AdminChat/AdminChatPage";
import TestTasksPage from "../pages/TestTasks/TestTasksPage";
import { HomePage } from "../pages/Home/HomePage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import { CarsPage } from "../pages/Cars/CarsPage";
import { VehicleDetailsPage } from "../pages/Cars/VehicleDetailsPage";

/**
 * The application's only route table.
 *
 * Every public page is a child of SiteLayout so the header and footer have one
 * implementation, and `*` renders the 404 instead of falling back to the home
 * page. Admin paths are lowercase; `/admin` sits outside SiteLayout because the
 * console draws its own chrome through AdminShell.
 */
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Scrolls to #inventory / #test-drive after a redirect back from the
            sign-in screen or a link from another page. */}
        <HashScrollHandler />
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<HomePage />} />
            <Route path="cars" element={<CarsPage />} />
            <Route path="cars/:id" element={<VehicleDetailsPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="contact" element={<ContactPage />} />
            {/* Unknown URLs land here with the site chrome intact. */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>

          {/* LoginPage is a full-bleed, two-column screen, so it sits outside
              SiteLayout and draws its own header. */}
          <Route
            path="login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="register" element={<RegisterPage />} />
          {/* Component scratch page; reachable in dev builds only. */}
          {import.meta.env.DEV && (
            <Route path="test" element={<TestTasksPage />} />
          )}

          <Route element={<ProtectedRoute />}>
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>

          <Route path="admin" element={<AdminLayout />}>
            <Route index element={<AdminPage />} />
            <Route path="chat" element={<AdminChatPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
