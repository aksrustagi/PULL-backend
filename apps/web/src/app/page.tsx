import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="z-10 w-full max-w-5xl items-center justify-between text-sm lg:flex">
        <div className="fixed left-0 top-0 flex w-full justify-center border-b border-border bg-background/80 pb-6 pt-8 backdrop-blur-2xl lg:static lg:w-auto lg:rounded-xl lg:border lg:p-4">
          <span className="text-2xl font-bold text-pull-500">PULL</span>
        </div>
      </div>

      <div className="relative flex flex-col items-center justify-center gap-8 py-24">
        <h1 className="text-center text-5xl font-bold tracking-tight sm:text-6xl">
          Trade. Predict.{" "}
          <span className="text-pull-500">Connect.</span>
        </h1>
        <p className="max-w-2xl text-center text-lg text-muted-foreground">
          The super app for prediction markets, crypto trading, real-world
          assets, and intelligent communication. All in one place.
        </p>

        <div className="flex gap-4">
          <Link
            href="/dashboard"
            className="rounded-lg bg-pull-500 px-6 py-3 font-semibold text-white transition-colors hover:bg-pull-600"
          >
            Get Started
          </Link>
          <Link
            href="/markets"
            className="rounded-lg border border-border px-6 py-3 font-semibold transition-colors hover:bg-muted"
          >
            Explore Markets
          </Link>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <FeatureCard
            title="Prediction Markets"
            description="Trade on real-world events with YES/NO contracts"
            icon="📈"
          />
          <FeatureCard
            title="Crypto Trading"
            description="Buy, sell, and manage your crypto portfolio"
            icon="💰"
          />
          <FeatureCard
            title="RWA Trading"
            description="Trade fractional shares of Pokemon cards & collectibles"
            icon="🃏"
          />
          <FeatureCard
            title="Smart Email"
            description="AI-powered email triage and smart replies"
            icon="📧"
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="group rounded-xl border border-border p-6 transition-colors hover:border-pull-500/50 hover:bg-muted/50">
      <div className="mb-4 text-4xl">{icon}</div>
      <h3 className="mb-2 font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
