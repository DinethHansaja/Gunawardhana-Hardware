"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});
type LoginValues = z.infer<typeof schema>;

export function LoginForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword(values);
      if (error) {
        setServerError("Sign-in failed. Check your details or contact the administrator.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setServerError("Could not connect to the authentication service. Try again shortly.");
    }
  }

  const fieldClass = "mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100";
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
      <div>
        <label htmlFor="email" className="text-sm font-medium text-slate-700">Email address</label>
        <input id="email" type="email" autoComplete="username" {...register("email")} disabled={disabled || isSubmitting} className={fieldClass} aria-invalid={Boolean(errors.email)} />
        {errors.email && <p className="mt-1 text-xs text-red-700">{errors.email.message}</p>}
      </div>
      <div>
        <label htmlFor="password" className="text-sm font-medium text-slate-700">Password</label>
        <input id="password" type="password" autoComplete="current-password" {...register("password")} disabled={disabled || isSubmitting} className={fieldClass} aria-invalid={Boolean(errors.password)} />
        {errors.password && <p className="mt-1 text-xs text-red-700">{errors.password.message}</p>}
      </div>
      {serverError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{serverError}</p>}
      <button type="submit" disabled={disabled || isSubmitting} className="w-full rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{isSubmitting ? "Signing in…" : "Sign in"}</button>
    </form>
  );
}
