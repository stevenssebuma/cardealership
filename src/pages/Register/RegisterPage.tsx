import {
  ArrowLeft,
  BadgeCheck,
  CalendarDays,
  CarFront,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router";
import { RegisterForm } from "@/features/auth/components/RegisterForm";

export function RegisterPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_srgb,var(--primary)_18%,transparent),transparent_38%),radial-gradient(circle_at_bottom_right,color-mix(in_srgb,var(--primary)_10%,transparent),transparent_42%)]" />
      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl lg:grid-cols-[1.08fr_0.92fr]">
        <section
          className="hidden border-r border-border/70 p-12 lg:flex lg:flex-col lg:justify-between xl:p-16"
          aria-label="Panda Motors customer benefits"
        >
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-3 rounded-full border border-border/80 bg-card/70 px-4 py-2 text-sm font-semibold backdrop-blur-xl transition-colors hover:border-primary/50"
          >
            <CarFront className="size-5 text-primary" aria-hidden="true" />
            Panda Motors
          </Link>

          <div className="max-w-xl space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
              A better way to find your next car
            </div>

            <div className="space-y-4">
              <h1 className="text-5xl font-black leading-[1.05] tracking-tight xl:text-6xl">
                Your next journey starts{" "}
                <span className="text-primary">here.</span>
              </h1>
              <p className="max-w-lg text-lg leading-8 text-muted-foreground">
                Create your customer account and enjoy a smoother, more
                personal showroom experience.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-card/65 p-5 backdrop-blur-xl">
                <CarFront className="mb-3 size-6 text-primary" aria-hidden="true" />
                <p className="font-semibold">Find your next car</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Explore the latest vehicles available at Panda Motors.
                </p>
              </div>
              <div className="rounded-2xl border border-border/80 bg-card/65 p-5 backdrop-blur-xl">
                <CalendarDays className="mb-3 size-6 text-primary" aria-hidden="true" />
                <p className="font-semibold">Plan a test drive</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Book and keep track of your showroom appointments.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-border/70 pt-5 text-sm text-muted-foreground">
              <BadgeCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
              One account for your details and test-drive bookings.
            </div>
          </div>

          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Panda Motors · Your journey, made personal
          </p>
        </section>

        <section
          className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8 lg:px-12"
          aria-labelledby="register-title"
        >
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center justify-between lg:hidden">
              <Link to="/" className="inline-flex items-center gap-2 font-bold">
                <CarFront className="size-5 text-primary" aria-hidden="true" />
                Panda Motors
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Sign in
              </Link>
            </div>

            <div className="rounded-3xl border border-border/80 bg-card/85 p-6 shadow-2xl shadow-black/15 backdrop-blur-xl sm:p-9">
              <RegisterForm />
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-muted-foreground">
              Your details are used to manage your Panda Motors account and
              test-drive bookings.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
