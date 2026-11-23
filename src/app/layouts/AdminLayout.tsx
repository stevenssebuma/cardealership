import { Outlet } from "react-router-dom";
import ProtectedRoute from "../components/auth/ProtectedRoute";
import { AdminChatProvider } from "../../features/admin-chat/context/AdminChatContext";

/**
 * Staff console shell for /admin and /admin/chat.
 *
 * Both screens read the unread-chat count, so the chat provider has to sit
 * above the route outlet rather than inside either page. `adminOnly` keeps a
 * signed-in customer out; a signed-out visitor is sent to sign-in first by
 * ProtectedRoute.
 */
export function AdminLayout() {
  return (
    <ProtectedRoute adminOnly>
      <AdminChatProvider>
        <Outlet />
      </AdminChatProvider>
    </ProtectedRoute>
  );
}
