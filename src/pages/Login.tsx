// src/pages/Login.tsx

import React, { useState } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { login } from "../features/auth/services";
import { useAuth } from "../features/auth/hooks";
import { getSafeRedirectPath } from "../app/components/auth/routeAccess";
// @ts-ignore: CSS file is imported for styling
import "../styles/index.css";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login: applySession } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const result = await login({ email, password });

      if (result.success && result.session) {
        // Store the verified session in the AuthProvider so protected pages
        // (profile, settings, admin) are reachable straight after signing in.
        applySession(result.session);

        const fallback =
          result.session.user.role === "admin" ? "/Admin" : "/";

        navigate(
          getSafeRedirectPath(searchParams.get("redirect"), fallback)
        );
        return;
      }

      setError(
        result.message || "Login failed. Please check your details."
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Cannot connect to the configured API service."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Header */}
        <div className="login-header">
          <h1>Welcome Back Dear!</h1>

          <p>
            Sign in to your Panda Motors account 
            and Have the best blissfull experience ever 
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="login-form">

          {/* Email */}
          <div className="form-group">
            <label htmlFor="email">
              Email Address
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? "Signing In..." : "Sign In"}
          </button>
        </form>

        {/* Register Link */}
        <div className="login-register">
          <span>Don't have an account? Create one</span>{" "}
          <Link to="/register">
            Register
          </Link>
        </div>

      </div>
    </div>
  );
};

export default Login;