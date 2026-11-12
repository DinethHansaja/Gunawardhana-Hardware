import Link from "next/link";
import { ForgotPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gunawardhana Hardware</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-600">Use the contact email on your account to request a reset link. If no email is on file, ask an administrator to reset your password in User Management.</p>
        <ForgotPasswordForm />
        <Link href="/login" className="mt-5 inline-block text-sm font-medium underline underline-offset-4">Return to sign in</Link>
      </div>
    </main>
  );
}
