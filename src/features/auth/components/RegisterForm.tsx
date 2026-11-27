import { useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  ShieldCheck,
  UserRoundPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { register } from "../services";
import { useAuth } from "../hooks";

export function RegisterForm() {
  const navigate = useNavigate();
  const { login: applySession } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const clearError = () => {
    if (failed) {
      setMessage("");
      setFailed(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    setFailed(false);

    try {
      const result = await register({ firstName, lastName, email, password });

      if (result.success && result.session) {
        applySession(result.session);
        navigate("/profile");
        return;
      }

      setMessage(result.message || "We couldn't create your account. Please try again.");
      setFailed(true);
    } catch (requestError) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "We couldn't create your account. Please try again.",
      );
      setFailed(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] text-primary">
          <UserRoundPlus className="size-4" aria-hidden="true" />
          Customer account
        </div>
        <div>
          <h2
            id="register-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            Create your account
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Get started with bookings and a more personal showroom experience.
          </p>
        </div>
      </div>

      {message && (
        <div
          role={failed ? "alert" : "status"}
          className={
            failed
              ? "rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm leading-6 text-foreground"
              : "rounded-xl border border-border bg-muted/40 p-4 text-sm leading-6"
          }
        >
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="register-first-name" className="text-sm">
            First name
          </Label>
          <Input
            id="register-first-name"
            name="given-name"
            autoComplete="given-name"
            autoCapitalize="words"
            placeholder="e.g. Alex"
            value={firstName}
            onChange={(event) => {
              setFirstName(event.target.value);
              clearError();
            }}
            className="h-12 rounded-xl border-border/80 bg-background/70 px-4 placeholder:text-muted-foreground/70"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="register-last-name" className="text-sm">
            Last name
          </Label>
          <Input
            id="register-last-name"
            name="family-name"
            autoComplete="family-name"
            autoCapitalize="words"
            placeholder="e.g. Smith"
            value={lastName}
            onChange={(event) => {
              setLastName(event.target.value);
              clearError();
            }}
            className="h-12 rounded-xl border-border/80 bg-background/70 px-4 placeholder:text-muted-foreground/70"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-email" className="text-sm">
          Email address
        </Label>
        <Input
          id="register-email"
          name="email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          inputMode="email"
          placeholder="you@example.com"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            clearError();
          }}
          className="h-12 rounded-xl border-border/80 bg-background/70 px-4 placeholder:text-muted-foreground/70"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-password" className="text-sm">
          Password
        </Label>
        <div className="relative">
          <Input
            id="register-password"
            name="new-password"
            type={passwordVisible ? "text" : "password"}
            autoComplete="new-password"
            placeholder="Create a password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              clearError();
            }}
            className="h-12 rounded-xl border-border/80 bg-background/70 px-4 pr-12 placeholder:text-muted-foreground/70"
            aria-describedby="register-password-hint"
            minLength={6}
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
            aria-controls="register-password"
          >
            {passwordVisible ? (
              <EyeOff className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <p id="register-password-hint" className="text-xs leading-5 text-muted-foreground">
          Use at least 6 characters.
        </p>
      </div>

      <div className="space-y-4 pt-1">
        <Button
          type="submit"
          disabled={submitting}
          className="h-12 w-full rounded-xl text-sm font-bold shadow-lg shadow-primary/10 transition-all hover:-translate-y-0.5 hover:shadow-primary/20"
        >
          {submitting ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Creating your account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Button>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
          Your password is stored securely.
        </div>
      </div>

      <div className="border-t border-border/70 pt-5">
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary underline-offset-4 transition-colors hover:text-primary/80 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </form>
  );
}
