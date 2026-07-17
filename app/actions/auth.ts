"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export type LoginState = {
  error: string | null;
  status?: number | string | null;
  code?: string | null;
};

/**
 * Server-side login kept for compatibility.
 * Primary login UI uses createBrowserClient in LoginForm.
 */
export async function login(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "이메일과 비밀번호를 입력해 주세요.", status: null };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    const code = (error as { code?: string }).code ?? null;
    console.error("[login/server] Supabase auth error", {
      message: error.message,
      status: error.status,
      name: error.name,
      code,
    });
    return {
      error: error.message,
      status: error.status ?? null,
      code,
    };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
