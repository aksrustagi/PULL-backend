"use client";

import { redirect } from "next/navigation";

export default function AdminPage() {
  // Redirect to analytics dashboard
  redirect("/admin/analytics");
}
