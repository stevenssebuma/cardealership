import { BrowserRouter, Route, Routes } from "react-router-dom";
import Profile from "../pages/profile";
import { AuthProvider } from "./context/auth";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import { PublicOnlyRoute } from "./components/auth/PublicOnlyRoute";
import Login from "../pages/Login";
import RegisterPage from "../pages/Register";
import Admin from "../pages/Admin";
import TestTasks from "../pages/TestTasks/TestTasks";
import { HomePage } from "../pages/Home/HomePage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/test" element={<TestTasks />} />
          <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
          <Route path="/register" element={<RegisterPage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/Admin" element={<Admin />} />
          </Route>
          <Route path="/*" element={<HomePage />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}