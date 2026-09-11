// src/pages/Login.tsx

import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { apiRequest } from "../api/client";
// @ts-ignore: CSS file is imported for styling
import "../styles/index.css";

const Login: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setError("");
    setDebugInfo("");
    setLoading(true);

    try {
      setDebugInfo("1. Trying to connect to backend...");

      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      setDebugInfo(`2. Response status: ${response.status}`);

      const data = await response.json();

      setDebugInfo(`3. Response data: ${JSON.stringify(data)}`);

      if (response.ok) {
        setDebugInfo("4. Login successful!");

        // Save authentication information
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // Redirect based on user role
        setTimeout(() => {
          if (data.user?.role === "admin") {
            navigate("/Admin");
          } else {
            navigate("/");
          }
        }, 500);
      } else {
        setError(data.message || "Login failed. Please check your details.");
      }
    } catch (error: any) {
      console.error("Login error:", error);

      setDebugInfo(`Error: ${error.message}`);

      setError("Cannot connect to the configured API service.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">

        {/* Header */}
        <div className="login-header">
          <h1>Welcome Back</h1>

          <p>
            Sign in to your Panda Motors account
          </p>
        </div>

        {/* Error Message */}
        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        {/* Debug Information */}
        {debugInfo && (
          <div className="login-debug">
            {debugInfo}
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
          <span>Don't have an account?</span>{" "}
          <Link to="/register">
            Register
          </Link>
        </div>

      </div>
    </div>
  );
};

export default Login;