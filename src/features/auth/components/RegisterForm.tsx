import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { register } from "../services";
import { useAuth } from "../hooks";

export function RegisterForm() {
  const navigate = useNavigate();
  const { login: applySession } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
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

    const result = await register({ firstName, lastName, email, password });

    if (result.success && result.session) {
      // Registration returns a JWT, so the new customer is signed in straight
      // away and can open the protected profile page.
      applySession(result.session);
      navigate("/profile");
      return;
    }

    setMessage(result.message);
    setFailed(true);
    setSubmitting(false);
  };

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div>
        <h2 className="text-3xl font-bold mb-2">Create Account</h2>
        <p className="text-sm text-muted-foreground">
          Register to book test drives and receive personalised vehicle updates.
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

      <div className="grid grid-cols-2 gap-4">
        <Input
          placeholder="First Name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
          className="h-12"
          required
        />
        <Input
          placeholder="Last Name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
          className="h-12"
          required
        />
      </div>
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
        {submitting ? "Creating account..." : "Create Account"}
      </Button>

      <p className="text-sm text-muted-foreground text-center">
        Already have an account?{" "}
        <Link to="/login" className="text-primary font-semibold hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
