"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4 p-8">
        <h2 className="text-xl font-semibold text-foreground">Authentication Error</h2>
        <p className="text-muted-foreground">
          Something went wrong during authentication.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
          >
            Try again
          </button>
          <Link
            href="/login"
            className="px-4 py-2 border border-border text-foreground rounded-md hover:bg-muted"
          >
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
