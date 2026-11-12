import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/auth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "./components/auth/PublicOnlyRoute";
import { HashScrollHandler } from "./providers/HashScrollHandler";
import { LoginPage } from "../pages/Login/LoginPage";
import { RegisterPage } from "../pages/Register/RegisterPage";
import ProfilePage from "../pages/Profile/ProfilePage";
import AdminPage from "../pages/Admin/AdminPage";
import { AdminChatPage } from "../pages/AdminChat/AdminChatPage";
import { AdminChatProvider } from "../features/admin-chat/context/AdminChatContext";
import TestTasksPage from "../pages/TestTasks/TestTasksPage";
import { HomePage } from "../pages/Home/HomePage";
import { SettingsPage } from "../pages/Settings/SettingsPage";
import { CarsPage } from "../pages/Cars/CarsPage";
import { useAuth } from "../features/auth/hooks";

function AdminChatLayout() {
  const { user } = useAuth();

  if (user?.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  return (
    <AdminChatProvider>
      <Outlet />
    </AdminChatProvider>
  );
}


export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Scrolls to #inventory / #test-drive after a redirect back from the
            sign-in screen or a link from another page. */}
        <HashScrollHandler />
        <Routes>
          <Route path="/test" element={<TestTasksPage />} />
          {/* LoginPage is a full-bleed, two-column screen. It must not be
              wrapped in AuthLayout, whose max-w-md card and site header squeeze
              the page and push the form outside the card. */}
          <Route
            path="/login"
            element={
              <PublicOnlyRoute>
                <LoginPage />
              </PublicOnlyRoute>
            }
          />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route
            path="/Admin"
            element={
              <ProtectedRoute>
                <AdminChatLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<AdminPage />} />
            <Route path="chat" element={<AdminChatPage />} />
          </Route>
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/cars" element={<CarsPage />} />
          <Route path="/*" element={<HomePage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
