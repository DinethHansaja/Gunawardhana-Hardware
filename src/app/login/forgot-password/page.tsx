import { ForgotPasswordForm } from "./form";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gunawardhana Hardware</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Reset your password</h1>
        <p className="mt-2 text-sm text-slate-600">We’ll send a password reset link to your work email.</p>
        <ForgotPasswordForm />
      </div>
    </main>
  );
}
