import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, Boxes, CircleDollarSign, PackageSearch, ShoppingBag } from "lucide-react";
import { getEmployee, getRoleHome } from "@/lib/auth/server";
import { SignOutButton } from "@/components/sign-out-button";

export const dynamic = "force-dynamic";

const nav = [
  { label: "Overview", href: "/dashboard", icon: "▦" },
  { label: "Point of sale", href: "/pos", icon: "▣" },
  { label: "Products", href: "/products", icon: "□" },
  { label: "Inventory", href: "/inventory", icon: "▤" },
  { label: "Purchasing", href: "/purchasing", icon: "↘" },
  { label: "Customers", href: "/customers", icon: "♙" },
  { label: "Reports", href: "/reports", icon: "▥" },
  { label: "Employees", href: "/employees", icon: "♙" },
];

const stats = [
  { label: "Today’s sales", value: "—", note: "Connect Supabase to load sales", icon: CircleDollarSign },
  { label: "Items in stock", value: "—", note: "Live inventory balance", icon: Boxes },
  { label: "Low stock", value: "—", note: "Products below reorder level", icon: PackageSearch },
  { label: "Invoices today", value: "—", note: "Posted transactions", icon: ShoppingBag },
];

export default async function Home() {
  const employee = await getEmployee();
  if (!employee) redirect("/login");
  if (employee.role !== "admin") redirect(getRoleHome(employee.role));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col bg-slate-900 text-slate-100 lg:flex">
        <div className="border-b border-slate-700 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Gunawardhana</p>
          <h1 className="mt-1 text-lg font-semibold">Hardware</h1>
        </div>
        <nav aria-label="Main navigation" className="space-y-1 px-3 py-5">
          {nav.map((item, index) => (
            <Link key={item.href} href={item.href} className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm ${index === 0 ? "bg-slate-700 font-medium text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <span aria-hidden="true" className="w-5 text-center text-base">{item.icon}</span>{item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto border-t border-slate-700 px-6 py-4 text-xs text-slate-400">Single branch · LKR · Asia/Colombo</div>
      </aside>

      <main className="lg:pl-64">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8">
          <div className="text-sm text-slate-500">Workspace <span className="px-2 text-slate-300">/</span><span className="font-medium text-slate-900">Overview</span></div>
          <div className="flex items-center gap-3"><span className="hidden text-sm text-slate-500 sm:inline">{employee.displayName} · Admin</span><SignOutButton /><div className="grid size-9 place-items-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700" aria-hidden="true">GH</div></div>
        </header>

        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm font-medium text-slate-500">Single branch · LKR · Asia/Colombo</p><h2 className="mt-1 text-2xl font-semibold tracking-tight">Store overview</h2><p className="mt-1 text-sm text-slate-500">Operational snapshot for your hardware store.</p></div>
            <Link href="/pos" className="rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">Open point of sale</Link>
          </div>

          <section aria-label="Business metrics" className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, note, icon: Icon }) => <article key={label} className="rounded-lg border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between"><p className="text-sm font-medium text-slate-600">{label}</p><Icon aria-hidden="true" className="size-4 text-slate-400" /></div>
              <p className="mt-4 text-3xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p>
            </article>)}
          </section>

          <section className="mt-6 grid gap-5 xl:grid-cols-[1.6fr_1fr]">
            <article className="rounded-lg border border-slate-200 bg-white">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h3 className="text-sm font-semibold">Sales activity</h3><p className="mt-1 text-xs text-slate-500">Daily totals will appear after database setup</p></div><span className="text-xs text-slate-500">Last 7 days</span></div>
              <div className="grid min-h-64 place-items-center p-6 text-center"><div><div className="mx-auto grid size-10 place-items-center rounded-full bg-slate-100 text-slate-500">⌁</div><p className="mt-3 text-sm font-medium text-slate-700">No sales data connected</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">Live reporting becomes available after Supabase is configured and transactions are recorded.</p></div></div>
            </article>
            <article className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-5 py-4"><h3 className="text-sm font-semibold">Quick access</h3><p className="mt-1 text-xs text-slate-500">Common store workflows</p></div>
              <div className="divide-y divide-slate-100">
                <QuickLink href="/products" title="Product catalog" detail="Manage items, variants, and prices" icon={<ArrowUpRight className="size-4" />} />
                <QuickLink href="/inventory" title="Stock control" detail="Review balances and stock movements" icon={<ArrowDownRight className="size-4" />} />
                <QuickLink href="/purchasing" title="Record a purchase" detail="Receive goods from a supplier" icon={<ArrowDownRight className="size-4" />} />
              </div>
            </article>
          </section>

          <p className="mt-7 text-xs text-slate-500">Foundation preview · Sign-in, role enforcement, and live data are not configured yet.</p>
        </div>
      </main>
    </div>
  );
}

function QuickLink({ href, title, detail, icon }: { href: string; title: string; detail: string; icon: React.ReactNode }) {
  return <Link href={href} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-slate-50"><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div><span className="text-slate-400">{icon}</span></Link>;
}
