import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { login } from "../services";
import { useAuth } from "../hooks";
import { getSafeRedirectPath } from "../../../app/components/auth/routeAccess";

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const { login: applySession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setFailed(false);

    const result = await login({ email, password });

    if (result.success && result.session) {
      // Apply the verified session to the AuthProvider so protected routes
      // (profile, settings, admin) unlock immediately after signing in.
      applySession(result.session);
      const fallback = result.session.user.role === "admin" ? "/Admin" : "/";
      navigate(getSafeRedirectPath(requestedRedirect, fallback));
      return;
    }

    setMessage(
      result.success
        ? "Signed in, but the session could not be stored. Please try again."
        : result.message,
    );
    setFailed(true);
    setSubmitting(false);
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-3xl font-bold mb-2">Sign In</h2>
        <p className="text-sm text-muted-foreground">
          Access your account to book test drives and manage enquiries for the best experience.
        </p>
      </div>

      {message && (
        <div
          role={failed ? "alert" : "status"}
          className={
            failed
              ? "rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm"
              : "rounded-lg border border-border bg-muted/40 p-4 text-sm"
          }
        >
          {message}
        </div>
      )}

      <Input
        type="email"
        placeholder="Email Address"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className="h-12"
        required
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="h-12"
        required
      />

      <Button
        type="submit"
        disabled={submitting}
        className="w-full h-12 bg-primary text-white hover:bg-primary/90"
      >
        {submitting ? "Signing in..." : "Sign In"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        Don&apos;t have an account? {" "}
        <Link to="/register" className="text-primary font-semibold hover:underline">
          Let's Create one for the best experience ever ! 
        </Link>
      </p>
    </form>
  );
}
