"use client";

import { useTransition } from "react";
import { logout } from "@/app/actions/auth";

export default function LogoutButton() {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => logout())}
      className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-navy-700 hover:bg-navy-800 hover:text-white disabled:opacity-60"
    >
      {pending ? "로그아웃..." : "로그아웃"}
    </button>
  );
}
