import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "../services";
import { useAuth } from "../hooks";
import { getSafeRedirectPath } from "../../../app/components/auth/routeAccess";

const SHOWROOM_EMAIL = "sales@pandamotors.co.ug";
const SHOWROOM_PHONE = "+256 770 826 951";
const SHOWROOM_PHONE_HREF = "tel:+256770826951";

export function LoginForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedRedirect = searchParams.get("redirect");
  const { login: applySession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [resetHelpOpen, setResetHelpOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setFailed(false);

    const result = await login({ email, password }, { remember });

    if (result.success && result.session) {
      // Apply the verified session to the AuthProvider so protected routes
      // (profile, settings, admin) unlock immediately after signing in.
      applySession(result.session);
      const fallback = result.session.user.role === "admin" ? "/admin" : "/";
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
          Access your account to book test drives and manage your enquiries.
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

      <div className="space-y-2">
        <Label htmlFor="login-email" className="sr-only">
          Email address
        </Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-12"
          autoComplete="email"
          inputMode="email"
          aria-invalid={failed || undefined}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="login-password" className="sr-only">
          Password
        </Label>
        <div className="relative">
          <Input
            id="login-password"
            name="password"
            type={passwordVisible ? "text" : "password"}
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-12 pr-12"
            autoComplete="current-password"
            aria-invalid={failed || undefined}
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 size-10 -translate-y-1/2 text-muted-foreground hover:bg-transparent hover:text-foreground"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            aria-controls="login-password"
          >
            {passwordVisible ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="login-remember"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          <Label htmlFor="login-remember" className="text-sm font-normal text-muted-foreground">
            Keep me signed in
          </Label>
        </div>

        <button
          type="button"
          className="text-sm font-semibold text-primary hover:underline"
          onClick={() => setResetHelpOpen((open) => !open)}
          aria-expanded={resetHelpOpen}
          aria-controls="login-reset-help"
        >
          Forgot password?
        </button>
      </div>

      {resetHelpOpen && (
        <div
          id="login-reset-help"
          role="region"
          aria-label="How to reset your password"
          className="rounded-lg border border-border bg-muted/40 p-4 text-sm leading-6 text-muted-foreground"
        >
          Password resets are handled by the showroom team. Email{" "}
          <a
            href={`mailto:${SHOWROOM_EMAIL}?subject=${encodeURIComponent("Password reset request")}`}
            className="font-semibold text-primary hover:underline"
          >
            {SHOWROOM_EMAIL}
          </a>{" "}
          or call{" "}
          <a href={SHOWROOM_PHONE_HREF} className="font-semibold text-primary hover:underline">
            {SHOWROOM_PHONE}
          </a>
          .
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full h-12">
        {submitting ? "Signing in..." : "Sign In"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        Don&apos;t have an account?{" "}
        <Link to="/register" className="text-primary font-semibold hover:underline">
          Create one
        </Link>
      </p>
    </form>
  );
}
