import { UpdatePasswordForm } from "./update-password-form";

export const dynamic = "force-dynamic";

export default function UpdatePasswordPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gunawardhana Hardware</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Set a new password</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a strong password for your account.</p>
        <UpdatePasswordForm />
      </div>
    </main>
  );
}
