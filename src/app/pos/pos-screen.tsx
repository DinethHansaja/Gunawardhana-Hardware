"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatCurrencyLkr, formatQuantity } from "@/lib/format";

export type PosBranch = { id: string; name: string; address: string | null; phone: string | null };
type Product = {
  variant_id: string;
  product_name: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  category: string | null;
  subcategory: string | null;
  variant_label: string | null;
  size_specification: string | null;
  unit: string;
  unit_decimal_places: number;
  default_selling_price: number | string;
  available_quantity: number | string;
};
type CartLine = Product & { quantity: string; unitPrice: string; overrideReason: string };
type Customer = {
  customer_id: string;
  display_name: string;
  phone: string | null;
  credit_eligible: boolean;
  credit_limit: number | string;
  outstanding_balance: number | string;
  available_credit: number | string;
};
type PaymentLine = { method: "cash" | "bank_transfer" | "card"; amount: string };
type CompletedSale = {
  saleId: string;
  invoiceNumber: string;
  cashierName: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  amountPaid: number;
  changeDue: number;
  creditOutstanding: number;
  customerName: string;
  payments: Array<{ method: string; amount: number | string }>;
  items: Array<{ name: string; sku: string; variant: string | null; unit: string; quantity: number | string; price: number | string; discount: number | string; total: number | string }>;
};

const money = (value: number | string) => formatCurrencyLkr(Number(value));
const amount = (value: string) => Number(value || 0);

export function PosScreen({ branches, role }: { branches: PosBranch[]; role: "admin" | "cashier" }) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerOptions, setCustomerOptions] = useState<Customer[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [paymentLines, setPaymentLines] = useState<PaymentLine[]>([{ method: "cash", amount: "" }]);
  const [allowCredit, setAllowCredit] = useState(false);
  const [creditOverrideReason, setCreditOverrideReason] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const checkoutKey = useRef<string | null>(null);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.default_selling_price) * amount(item.quantity), 0), [cart]);
  const totalDiscount = useMemo(() => cart.reduce((sum, item) => sum + Math.max(Number(item.default_selling_price) - amount(item.unitPrice), 0) * amount(item.quantity), 0), [cart]);
  const total = useMemo(() => cart.reduce((sum, item) => sum + amount(item.unitPrice) * amount(item.quantity), 0), [cart]);
  const tendered = useMemo(() => paymentLines.reduce((sum, payment) => sum + amount(payment.amount), 0), [paymentLines]);
  const change = Math.max(tendered - total, 0);
  const estimatedCredit = Math.max(total - tendered, 0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const runSearch = useCallback(async (term: string, searchOffset = 0) => {
    if (!term || !branchId) { setProducts([]); return []; }
    setSearchBusy(true);
    setSearchError(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("search_pos_products", {
        p_branch_id: branchId, p_query: term, p_limit: 20, p_offset: searchOffset,
      });
      if (error) throw error;
      const rows = (data ?? []) as Product[];
      setProducts((previous) => searchOffset === 0 ? rows : [...previous, ...rows]);
      setSelectedIndex(0);
      return rows;
    } catch {
      setSearchError("Product search is unavailable. Check the database connection and migration status.");
      return [];
    } finally { setSearchBusy(false); }
  }, [branchId]);

  useEffect(() => {
    if (!debouncedQuery) return;
    const timer = window.setTimeout(() => { void runSearch(debouncedQuery, 0); }, 0);
    return () => window.clearTimeout(timer);
  }, [debouncedQuery, branchId, runSearch]);

  useEffect(() => {
    if (!customerQuery.trim()) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.rpc("search_pos_customers", { p_query: customerQuery.trim(), p_limit: 20 });
        if (!error && active) setCustomerOptions((data ?? []) as Customer[]);
      } catch { if (active) setCustomerOptions([]); }
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [customerQuery]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement | null)?.tagName ?? "")) {
        event.preventDefault(); searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  function addProduct(product: Product) {
    setCheckoutError(null);
    setCompletedSale(null);
    setCart((previous) => {
      const existing = previous.find((line) => line.variant_id === product.variant_id);
      if (existing) return previous.map((line) => line.variant_id === product.variant_id ? { ...line, quantity: String(amount(line.quantity) + 1) } : line);
      return [...previous, { ...product, quantity: "1", unitPrice: String(Number(product.default_selling_price)), overrideReason: "" }];
    });
    searchInput.current?.focus();
  }

  async function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && products.length) { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, products.length - 1)); }
    else if (event.key === "ArrowUp" && products.length) { event.preventDefault(); setSelectedIndex((index) => Math.max(index - 1, 0)); }
    else if (event.key === "Enter") {
      event.preventDefault();
      const term = query.trim();
      const exact = products.find((product) => product.barcode?.toLowerCase() === term.toLowerCase() || product.sku.toLowerCase() === term.toLowerCase());
      if (exact) addProduct(exact);
      else if (products[selectedIndex]) addProduct(products[selectedIndex]);
      else {
        const rows = await runSearch(term, 0);
        if (rows[0]) addProduct(rows[0]);
        else setSearchError("No active product matched that barcode or search term.");
      }
    }
  }

  function updateLine(variantId: string, patch: Partial<Pick<CartLine, "quantity" | "unitPrice" | "overrideReason">>) {
    setCart((previous) => previous.map((line) => line.variant_id === variantId ? { ...line, ...patch } : line));
  }

  function updatePayment(index: number, patch: Partial<PaymentLine>) {
    setPaymentLines((previous) => previous.map((line, row) => row === index ? { ...line, ...patch } : line));
  }

  async function completeSale() {
    setCheckoutError(null);
    setCompletedSale(null);
    if (!cart.length) { setCheckoutError("Add at least one product to the cart."); return; }
    if (allowCredit && !customer) { setCheckoutError("Select a registered customer before completing a credit sale."); return; }
    if (allowCredit && estimatedCredit > 0 && !customer?.credit_eligible && role !== "admin") {
      setCheckoutError("The selected customer is not eligible for credit."); return;
    }
    setCheckoutBusy(true);
    try {
      const supabase = createClient();
      const key = checkoutKey.current ?? window.sessionStorage.getItem("gh-pos-checkout-key") ?? crypto.randomUUID();
      checkoutKey.current = key;
      window.sessionStorage.setItem("gh-pos-checkout-key", key);
      const payload = {
        branch_id: branchId,
        customer_id: customer?.customer_id ?? null,
        idempotency_key: key,
        allow_credit: allowCredit,
        credit_limit_override_reason: creditOverrideReason.trim() || null,
        items: cart.map((item) => ({
          variant_id: item.variant_id,
          quantity: Number(item.quantity),
          unit_price: Number(item.unitPrice),
          override_reason: amount(item.unitPrice) !== Number(item.default_selling_price) ? item.overrideReason.trim() : null,
        })),
        payments: paymentLines.filter((payment) => amount(payment.amount) > 0).map((payment) => ({ method: payment.method, amount: amount(payment.amount) })),
      };
      const { data, error } = await supabase.rpc("checkout_sale", { p_payload: payload });
      if (error) {
        const known = ["Insufficient stock", "Customer credit limit would be exceeded", "Customer is not eligible for credit", "Cashier discount exceeds the configured limit", "Selling price is below the configured minimum margin", "A reason is required when overriding the selling price", "Payment is short; authorize a customer credit sale or add payment"];
        setCheckoutError(error.message === "Checkout key was already used for a different request"
          ? "This retry differs from a checkout already recorded. No duplicate was created; review the sale before starting another bill."
          : known.includes(error.message) ? error.message : "Sale could not be completed. Review the cart and try again.");
        return;
      }
      const sale = data as { sale_id: string; invoice_number: string; customer_name: string; cashier_name: string; subtotal: string | number; discount_total: string | number; tax_total: string | number; total: string | number; amount_paid: string | number; change_due: string | number; credit_outstanding: string | number; items: CompletedSale["items"]; payments: CompletedSale["payments"] };
      setCompletedSale({
        saleId: sale.sale_id,
        invoiceNumber: sale.invoice_number,
        cashierName: sale.cashier_name, subtotal: Number(sale.subtotal), discountTotal: Number(sale.discount_total), taxTotal: Number(sale.tax_total),
        total: Number(sale.total), amountPaid: Number(sale.amount_paid), changeDue: Number(sale.change_due), creditOutstanding: Number(sale.credit_outstanding),
        customerName: sale.customer_name,
        payments: sale.payments ?? [],
        items: sale.items ?? [],
      });
      setCart([]); setPaymentLines([{ method: "cash", amount: "" }]); setAllowCredit(false); setCreditOverrideReason(""); setCustomer(null); setCustomerQuery("");
      checkoutKey.current = null;
      window.sessionStorage.removeItem("gh-pos-checkout-key");
    } catch {
      setCheckoutError("Connection interrupted. Retry this same checkout before changing the cart; the request key prevents duplicate sales.");
    } finally { setCheckoutBusy(false); }
  }

  return <>
    <section className="print:hidden mt-6 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(350px,0.9fr)]">
      <div className="space-y-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block min-w-48 flex-1 text-xs font-medium uppercase tracking-wide text-slate-500">Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setProducts([]); setOffset(0); }} className="mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm normal-case tracking-normal text-slate-900">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <p className="text-xs text-slate-500">Press <kbd className="rounded border border-slate-300 px-1.5 py-0.5">/</kbd> to focus search</p>
          </div>
          <label htmlFor="pos-search" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-500">Product search or barcode</label>
          <input ref={searchInput} id="pos-search" value={query} onChange={(event) => { setQuery(event.target.value); setProducts([]); setOffset(0); setSearchError(null); }} onKeyDown={handleSearchKeyDown} placeholder="Search name, SKU, brand, size, or scan barcode" autoComplete="off" className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-3 text-base outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
          {searchError && <p role="alert" className="mt-2 text-sm text-red-700">{searchError}</p>}
          {searchBusy && <p className="mt-2 text-xs text-slate-500">Searching catalog…</p>}
          {products.length > 0 && <div role="listbox" aria-label="Product search results" className="mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {products.map((product, index) => <button key={product.variant_id} type="button" role="option" aria-selected={index === selectedIndex} onMouseEnter={() => setSelectedIndex(index)} onClick={() => addProduct(product)} className={`flex w-full items-center justify-between gap-4 px-3 py-3 text-left ${index === selectedIndex ? "bg-slate-100" : "bg-white hover:bg-slate-50"}`}>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{product.product_name}{product.variant_label ? ` · ${product.variant_label}` : ""}{product.size_specification ? ` · ${product.size_specification}` : ""}</span><span className="mt-1 block truncate text-xs text-slate-500">{product.sku}{product.barcode ? ` · ${product.barcode}` : ""} · Stock {formatQuantity(Number(product.available_quantity), Number(product.unit_decimal_places))} {product.unit}</span></span>
              <span className="shrink-0 text-right"><span className="block text-sm font-semibold">{money(product.default_selling_price)}</span><span className="text-xs text-slate-500">per {product.unit}</span></span>
            </button>)}
            {products.length >= 20 && <button type="button" onClick={() => { const next = offset + 20; setOffset(next); void runSearch(debouncedQuery, next); }} className="w-full px-3 py-2.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50">Load more results</button>}
          </div>}
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold">Current bill</h2><p className="mt-0.5 text-xs text-slate-500">{cart.length} line{cart.length === 1 ? "" : "s"}</p></div><button type="button" onClick={() => { if (window.confirm("Clear all items from this bill?")) { setCart([]); setCheckoutError(null); } }} disabled={!cart.length || checkoutBusy} className="text-xs font-medium text-slate-600 underline underline-offset-4 disabled:opacity-40">Clear cart</button></div>
          {cart.length === 0 ? <div className="grid min-h-48 place-items-center px-4 text-center"><div><p className="text-sm font-medium text-slate-700">Cart is empty</p><p className="mt-1 text-xs text-slate-500">Scan a barcode or search the catalog to add an item.</p></div></div> : <div className="divide-y divide-slate-100">
            {cart.map((item) => {
              const available = Number(item.available_quantity);
              const qty = amount(item.quantity);
              const unitPrice = amount(item.unitPrice);
              const discount = Math.max(Number(item.default_selling_price) - unitPrice, 0) * qty;
              return <div key={item.variant_id} className="p-4">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium text-slate-800">{item.product_name}</p><p className="mt-0.5 text-xs text-slate-500">{item.sku}{item.variant_label ? ` · ${item.variant_label}` : ""}{item.size_specification ? ` · ${item.size_specification}` : ""} · {item.unit}</p><p className="mt-1 text-xs text-slate-500">Available: {formatQuantity(available, item.unit_decimal_places)} {item.unit}</p></div><button type="button" aria-label={`Remove ${item.product_name}`} onClick={() => setCart((previous) => previous.filter((line) => line.variant_id !== item.variant_id))} className="text-xs font-medium text-red-700 hover:underline">Remove</button></div>
                {qty > available && <p className="mt-2 text-xs font-medium text-amber-800">Quantity exceeds current stock; checkout will be rejected until corrected.</p>}
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <label className="text-xs text-slate-500">Quantity<input type="number" min="0.000001" step={10 ** -item.unit_decimal_places} value={item.quantity} onChange={(event) => updateLine(item.variant_id, { quantity: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-900" /></label>
                  <label className="text-xs text-slate-500">Bill price<input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(event) => updateLine(item.variant_id, { unitPrice: event.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-900" /></label>
                  <div className="text-xs text-slate-500">Default price<p className="mt-2 text-sm text-slate-700">{money(item.default_selling_price)}</p></div>
                  <div className="text-xs text-slate-500">Line total<p className="mt-2 text-sm font-semibold text-slate-900">{money(unitPrice * qty)}</p></div>
                </div>
                {unitPrice !== Number(item.default_selling_price) && <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center"><p className="text-xs font-medium text-green-800">Invoice discount: {money(discount)}{qty > 0 ? ` · ${money(Math.max(Number(item.default_selling_price) - unitPrice, 0))} per ${item.unit}` : ""}</p><label className="text-xs text-slate-500">Override reason<input value={item.overrideReason} onChange={(event) => updateLine(item.variant_id, { overrideReason: event.target.value })} required placeholder="Customer negotiation" className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-2 text-sm text-slate-900" /></label></div>}
              </div>;
            })}
          </div>}
        </div>
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Customer</h2>
          {customer ? <div className="mt-3 flex items-start justify-between rounded-md bg-slate-50 p-3"><div><p className="text-sm font-medium">{customer.display_name}</p><p className="mt-1 text-xs text-slate-500">{customer.phone || "No phone"}</p><p className="mt-1 text-xs text-slate-500">Credit available: {money(customer.available_credit)}</p></div><button type="button" onClick={() => setCustomer(null)} className="text-xs underline underline-offset-4">Change</button></div> : <>
            <input value={customerQuery} onChange={(event) => { setCustomerQuery(event.target.value); setCustomerOptions([]); }} placeholder="Search name or phone · walk-in if blank" className="mt-3 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
            {customerOptions.length > 0 && <div className="mt-2 max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">{customerOptions.map((option) => <button key={option.customer_id} type="button" onClick={() => { setCustomer(option); setCustomerQuery(""); setCustomerOptions([]); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50"><span className="block text-sm font-medium">{option.display_name}</span><span className="text-xs text-slate-500">{option.phone || "No phone"} · Outstanding {money(option.outstanding_balance)}</span></button>)}</div>}
          </>}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Payment</h2>
          <div className="mt-3 space-y-2">{paymentLines.map((payment, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2"><label className="sr-only" htmlFor={`method-${index}`}>Method {index + 1}</label><select id={`method-${index}`} value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value as PaymentLine["method"] })} className="rounded-md border border-slate-300 px-2 py-2 text-sm"><option value="cash">Cash</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option></select><label className="sr-only" htmlFor={`payment-${index}`}>Amount {index + 1}</label><input id={`payment-${index}`} type="number" min="0" step="0.01" value={payment.amount} onChange={(event) => updatePayment(index, { amount: event.target.value })} placeholder="Amount" className="rounded-md border border-slate-300 px-2 py-2 text-sm" />{paymentLines.length > 1 ? <button type="button" aria-label="Remove payment" onClick={() => setPaymentLines((previous) => previous.filter((_, row) => row !== index))} className="px-2 text-sm text-red-700">×</button> : <span />}</div>)}</div>
          <button type="button" onClick={() => setPaymentLines((previous) => [...previous, { method: "cash", amount: "" }])} className="mt-2 text-xs font-medium text-slate-600 underline underline-offset-4">Add split payment</button>
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allowCredit} onChange={(event) => setAllowCredit(event.target.checked)} className="size-4 accent-slate-800" />Allow remaining balance on customer credit</label>
          {allowCredit && <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600">{customer ? <>Customer outstanding: {money(customer.outstanding_balance)} · Credit limit: {money(customer.credit_limit)}</> : "Select a registered customer to use credit."}
            {estimatedCredit > 0 && customer && (estimatedCredit + Number(customer.outstanding_balance) > Number(customer.credit_limit) || !customer.credit_eligible) && role === "admin" && <label className="mt-3 block text-xs text-amber-900">Admin credit override reason<input value={creditOverrideReason} onChange={(event) => setCreditOverrideReason(event.target.value)} placeholder="Reason required for Admin approval" className="mt-1 block w-full rounded-md border border-amber-300 bg-white px-2 py-2 text-sm text-slate-900" /></label>}
          </div>}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-sm font-semibold">Invoice total</h2>
          <dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd>{money(subtotal)}</dd></div><div className="flex justify-between text-slate-600"><dt>Discounts</dt><dd>− {money(totalDiscount)}</dd></div><div className="flex justify-between border-t border-slate-100 pt-3 text-base font-semibold"><dt>Total</dt><dd>{money(total)}</dd></div><div className="flex justify-between text-slate-600"><dt>Tendered</dt><dd>{money(tendered)}</dd></div><div className="flex justify-between text-slate-600"><dt>Change</dt><dd>{money(change)}</dd></div>{allowCredit && <div className="flex justify-between text-slate-600"><dt>Credit balance</dt><dd>{money(estimatedCredit)}</dd></div>}</dl>
          {checkoutError && <p role="alert" className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">{checkoutError}</p>}
          <button type="button" onClick={completeSale} disabled={checkoutBusy || !cart.length} className="mt-4 w-full rounded-md bg-slate-800 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">{checkoutBusy ? "Processing sale…" : "Complete sale"}</button>
        </section>
      </aside>
    </section>

    {completedSale && <Receipt branch={branches.find((branch) => branch.id === branchId)} sale={completedSale} onPrint={() => window.print()} />}
  </>;
}

function Receipt({ branch, sale, onPrint }: { branch?: PosBranch; sale: CompletedSale; onPrint: () => void }) {
  return <section className="mt-6">
    <div className="mb-3 flex items-center justify-between print:hidden"><div><p role="status" className="text-sm font-semibold text-green-800">Sale completed · {sale.invoiceNumber}</p><p className="mt-1 text-xs text-slate-500">Reprinting this receipt will not create another sale.</p></div><button type="button" onClick={onPrint} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50">Print 80mm receipt</button></div>
    <div id="pos-receipt" className="mx-auto hidden w-[80mm] bg-white p-3 text-slate-900 print:block">
      <div className="text-center"><h1 className="text-base font-bold">Gunawardhana Hardware</h1>{branch?.name && <p className="text-xs">{branch.name}</p>}{branch?.address && <p className="text-[10px]">{branch.address}</p>}{branch?.phone && <p className="text-[10px]">{branch.phone}</p>}</div>
      <div className="my-2 border-t border-dashed border-slate-500" />
      <p className="text-[10px]">Invoice: {sale.invoiceNumber}</p><p className="text-[10px]">Customer: {sale.customerName}</p><p className="text-[10px]">Cashier: {sale.cashierName}</p><p className="text-[10px]">Date: {new Intl.DateTimeFormat("en-LK", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Colombo" }).format(new Date())}</p>
      <div className="my-2 border-t border-dashed border-slate-500" />
      {sale.items.map((item, index) => <div key={`${item.sku}-${index}`} className="mb-2 text-[10px]"><p className="font-semibold">{item.name}</p><p>{item.sku}{item.variant ? ` · ${item.variant}` : ""}</p><div className="flex justify-between"><span>{formatQuantity(Number(item.quantity))} {item.unit} × {money(item.price)}</span><span>{money(item.total)}</span></div>{Number(item.discount) > 0 && <p className="text-right">Discount −{money(item.discount)}</p>}</div>)}
      <div className="my-2 border-t border-dashed border-slate-500" />
      <div className="space-y-1 text-[11px]"><p className="flex justify-between"><span>Subtotal</span><span>{money(sale.subtotal)}</span></p><p className="flex justify-between"><span>Discount</span><span>−{money(sale.discountTotal)}</span></p>{sale.taxTotal > 0 && <p className="flex justify-between"><span>Tax</span><span>{money(sale.taxTotal)}</span></p>}<p className="flex justify-between font-bold"><span>Total</span><span>{money(sale.total)}</span></p>{sale.payments.map((payment, index) => <p key={`${payment.method}-${index}`} className="flex justify-between"><span>{payment.method.replace("_", " ")}</span><span>{money(payment.amount)}</span></p>)}<p className="flex justify-between"><span>Change</span><span>{money(sale.changeDue)}</span></p>{sale.creditOutstanding > 0 && <p className="flex justify-between"><span>Credit due</span><span>{money(sale.creditOutstanding)}</span></p>}</div>
      <p className="mt-4 text-center text-[10px]">Thank you for shopping with us.</p>
    </div>
  </section>;
}
