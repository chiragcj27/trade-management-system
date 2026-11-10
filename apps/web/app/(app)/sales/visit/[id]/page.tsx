"use client";

import { tr } from "@/lib/i18n";
import { NO_ORDER_REASONS, OUTCOME_LABEL, PAYMENT_MODE_LABEL, type BillOutcome, addDays, businessDate, formatRupees, rupeesToPaise } from "@repo/shared";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useEffect, useMemo, useState } from "react";
import { PhotoInput } from "@/components/photo-input";
import { useAct } from "@/components/providers";
import { useMe } from "@/components/shell";
import { Btn, Field, Loading, Rs, Segments, Stamp, Status } from "@/components/ui";
import { api, getGps, minutesBetween, newRef, timeOf, useData } from "@/lib/api";

export default function VisitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { staff } = useMe();
  const { data, error, loading, reload } = useData(`/field/visits/${id}`);
  const { act, busy } = useAct(reload);
  const canOrder = staff.role === "salesman";
  const [tab, setTab] = useState<"collect" | "order">("collect");

  if (!data) return <main className="page wrap phone"><Loading error={error} loading={loading} /></main>;
  const { visit, shop, bills } = data;
  const inShop = visit.status === "checked_in";

  return (
    <main className="page wrap phone">
      <div className="stack" style={{ gap: 4 }}>
        <Link href="/sales" className="small">{tr("Back to beat")}</Link>
        <h1>{shop.name}</h1>
        <p className="muted small">{tr("In shop since ")}{timeOf(visit.checkInAt)} ({minutesBetween(visit.checkInAt, visit.checkOutAt)}{tr(" min). ")}<Status value={visit.status} /></p>
      </div>

      {canOrder && <Segments value={tab} onChange={setTab} options={[{ value: "collect", label: `Collection (${bills.length})` }, { value: "order", label: visit.orderId ? "Order saved" : visit.noOrderReason ? "No order" : "Order" }]} />}

      {tab === "collect" ? <Collection data={data} reload={reload} /> : <OrderTab data={data} reload={reload} />}

      {inShop && (
        <Btn full tone="ghost" disabled={busy} onClick={() => act(async () => { await api(`/field/visits/${id}/checkout`, { body: { gps: await getGps(shop.location), deviceAt: new Date() } }); router.push("/sales"); }, "Checked out")}>{tr("Check out of shop")}</Btn>
      )}
    </main>
  );
}

function Collection({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { visit, shop, bills, payments, adjustments, receiptBook } = data;
  const { act, busy } = useAct(reload);
  const inShop = visit.status === "checked_in";
  const pending = bills.reduce((s: number, b: any) => s + b.openPaise, 0);
  const [mode, setMode] = useState<"cash" | "cheque" | "upi">("cash");
  const [amount, setAmount] = useState("");
  const [receiptNo, setReceiptNo] = useState("");
  const [chequeNo, setChequeNo] = useState("");
  const [chequeBank, setChequeBank] = useState("");
  const [chequeDate, setChequeDate] = useState(businessDate());
  const [chequePhoto, setChequePhoto] = useState<string | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [clientRef, setClientRef] = useState(newRef);
  const paise = rupeesToPaise(Number(amount) || 0);

  const openQr = payments.find((p: any) => p.status === "qr_shown");
  const nextReceipt = receiptNo || (receiptBook ? String(receiptBook.nextSerial) : "");

  const preview = useMemo(() => {
    let left = paise;
    return bills.map((b: any) => {
      const applied = Math.min(left, b.openPaise);
      left -= applied;
      return { id: b._id, applied };
    });
  }, [paise, bills]);
  const appliedFor = (billId: string) => preview.find((p: any) => p.id === billId)?.applied ?? 0;

  async function pay() {
    const gps = await getGps(shop.location);
    const common = { mode, clientRef, amountPaise: paise, gps };
    const body =
      mode === "cash" ? { ...common, receiptNo: Number(nextReceipt) }
      : mode === "cheque" ? { ...common, chequeNo, chequeBank, chequeDate, photoId: chequePhoto }
      : common;
    await api(`/field/visits/${visit._id}/payments`, { body });
    setAmount("");
    setReceiptNo("");
    setChequeNo("");
    setChequeBank("");
    setChequePhoto(null);
    setFormKey((k) => k + 1);
    setClientRef(newRef());
  }

  return (
    <div className="stack">
      {openQr && <QrPanel payment={openQr} reload={reload} shopName={shop.name} />}

      <div className="stack">
        <div className="row between"><h2>{tr("Pending bills, oldest first")}</h2><Rs paise={pending} /></div>
        {bills.length === 0 && <div className="card muted">{tr("No bills with you for this shop.")}</div>}
        {bills.map((b: any) => (
          <BillCard key={b._id} bill={b} visitId={visit._id} inShop={inShop} applied={appliedFor(b._id)} reload={reload} />
        ))}
      </div>

      {inShop && pending > 0 && !openQr && (
        <div className="card">
          <h2>{tr("Record a payment")}</h2>
          <Segments value={mode} onChange={setMode} options={[{ value: "cash", label: "Cash" }, { value: "cheque", label: "Cheque" }, { value: "upi", label: "UPI" }]} />
          <Field label="Amount received (₹)">
            <input type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <div className="row">
            <Btn tone="ghost" size="small" onClick={() => setAmount(String(pending / 100))}>{tr("Full ")}{formatRupees(pending)}</Btn>
          </div>
          {paise > pending && <p className="small bad-text">{tr("This is more than the ")}{formatRupees(pending)}{tr(" pending.")}</p>}
          {mode === "cash" && (
            <Field label="Receipt number from your book">
              <input type="number" inputMode="numeric" value={nextReceipt} onChange={(e) => setReceiptNo(e.target.value)} />
            </Field>
          )}
          {mode === "cheque" && (
            <>
              <div className="grid2">
                <Field label="Cheque number"><input type="text" inputMode="numeric" value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} /></Field>
                <Field label="Bank"><input type="text" value={chequeBank} onChange={(e) => setChequeBank(e.target.value)} /></Field>
              </div>
              <Field label="Date on the cheque"><input type="date" value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} /></Field>
              <PhotoInput key={formKey} kind="cheque" label="Photo of the cheque" onChange={setChequePhoto} />
            </>
          )}
          {mode === "upi" && <p className="small muted">{tr("The app makes a QR for this exact amount. The shopkeeper scans it from your phone.")}</p>}
          <Btn full disabled={busy || paise <= 0 || paise > pending || (mode === "cheque" && !chequePhoto)} onClick={() => act(pay, mode === "upi" ? "QR ready" : "Payment saved")}>
            {mode === "upi" ? tr("Show QR") : tr(`Save ${mode} payment`)}
          </Btn>
        </div>
      )}

      {inShop && bills.length > 0 && <AdjustmentForm visitId={visit._id} bills={bills} reload={reload} />}

      {payments.length > 0 && (
        <div className="stack">
          <h2>{tr("Payments in this visit")}</h2>
          {payments.map((p: any) => <PaymentRow key={p._id} payment={p} bills={bills} shop={shop} />)}
        </div>
      )}

      {adjustments.length > 0 && (
        <div className="stack">
          <h2>{tr("Discounts and returns")}</h2>
          {adjustments.map((a: any) => (
            <div key={a._id} className="card row between">
              <span>{a.kind === "cash_discount" ? tr("Cash discount") : tr("Goods return")} <Rs paise={a.amountPaise} /><br /><span className="small muted">{a.note}</span></span>
              <Status value={a.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BillCard({ bill, visitId, inShop, applied, reload }: { bill: any; visitId: string; inShop: boolean; applied: number; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [promiseDate, setPromiseDate] = useState(addDays(businessDate(), 3));
  const [asking, setAsking] = useState(false);
  const canMark = inShop && bill.openPaise > 0 && bill.outcome !== "paid";

  return (
    <div className="card">
      <div className="row between">
        <span><span className="mono">{bill.billNo}</span> <span className="small muted">{bill.billDate}</span></span>
        {bill.outcome && <Stamp tone={bill.outcome === "paid" ? "ok" : "warn"}>{tr(OUTCOME_LABEL[bill.outcome as BillOutcome])}</Stamp>}
      </div>
      <div className="row between small">
        <span className="muted">{tr("Bill ")}<Rs paise={bill.amountPaise} /></span>
        <strong>{tr("Pending ")}<Rs paise={bill.openPaise} /></strong>
      </div>
      {applied > 0 && <p className="small ok-text">{tr("This payment will apply ")}<Rs paise={applied} />{tr(" here.")}</p>}
      {bill.promiseDate && <p className="small muted">{tr("Will pay on ")}{bill.promiseDate}</p>}
      {canMark && !asking && (
        <div className="row">
          <Btn tone="ghost" size="small" onClick={() => setAsking(true)}>{tr("Will pay later")}</Btn>
          <Btn tone="ghost" size="small" disabled={busy} onClick={() => act(() => api(`/field/visits/${visitId}/outcome`, { body: { billId: bill._id, outcome: "returned_as_is" } }), "Marked returned as it is")}>{tr("Returned as it is")}</Btn>
        </div>
      )}
      {asking && (
        <div className="row">
          <input aria-label={tr("Promised payment date")} type="date" value={promiseDate} onChange={(e) => setPromiseDate(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
          <Btn size="small" disabled={busy} onClick={() => act(async () => { await api(`/field/visits/${visitId}/outcome`, { body: { billId: bill._id, outcome: "later", promiseDate } }); setAsking(false); }, "Promise saved")}>{tr("Save date")}</Btn>
        </div>
      )}
    </div>
  );
}

function QrPanel({ payment, reload, shopName }: { payment: any; reload: () => Promise<void>; shopName: string }) {
  const { act, busy } = useAct(reload);
  const [qr, setQr] = useState<string | null>(null);
  const [transactionRef, setTransactionRef] = useState("");

  useEffect(() => {
    void QRCode.toDataURL(payment.upiUrl, { width: 320, margin: 1 }).then(setQr);
  }, [payment.upiUrl]);

  return (
    <div className="card current">
      <h2 style={{ textAlign: "center" }}>{tr("Pay ")}<Rs paise={payment.amountPaise} /></h2>
      <p className="small muted" style={{ textAlign: "center" }}>{shopName}{tr(". QR reference ")}<span className="mono">{payment.qrRef}</span></p>
      {qr && <img className="qr" src={qr} alt={tr(`UPI QR for ${formatRupees(payment.amountPaise)}`)} />}
      <Field label="UPI transaction reference from the shopkeeper's phone">
        <input type="text" inputMode="numeric" value={transactionRef} onChange={(e) => setTransactionRef(e.target.value)} />
      </Field>
      <Btn full disabled={busy || transactionRef.trim().length < 6} onClick={() => act(() => api(`/field/payments/${payment._id}/upi-claim`, { body: { transactionRef } }), "Saved. The office will confirm it with the bank.")}>{tr("Payment done")}</Btn>
      <Btn full tone="danger" disabled={busy} onClick={() => act(() => api(`/field/payments/${payment._id}/upi-cancel`, { body: { reason: "Cancelled at the shop" } }), "QR cancelled")}>{tr("Cancel this QR")}</Btn>
    </div>
  );
}

function AdjustmentForm({ visitId, bills, reload }: { visitId: string; bills: any[]; reload: () => Promise<void> }) {
  const { act, busy } = useAct(reload);
  const [open, setOpen] = useState(false);
  const [billId, setBillId] = useState<string>(bills[0]?._id ?? "");
  const [kind, setKind] = useState<"cash_discount" | "goods_return">("cash_discount");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  if (!open) return <div><Btn tone="ghost" onClick={() => setOpen(true)}>{tr("Add cash discount or goods return")}</Btn></div>;
  return (
    <div className="card">
      <h2>{tr("Discount or goods return")}</h2>
      <Segments value={kind} onChange={setKind} options={[{ value: "cash_discount", label: "Cash discount" }, { value: "goods_return", label: "Goods return" }]} />
      <Field label="Bill">
        <select value={billId} onChange={(e) => setBillId(e.target.value)}>
          {bills.map((b) => <option key={b._id} value={b._id}>{b.billNo}{tr(", pending ")}{formatRupees(b.openPaise)}</option>)}
        </select>
      </Field>
      <Field label="Amount (₹)"><input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Note"><input type="text" value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      <p className="small muted">{kind === "goods_return" ? tr("This counts only after the godown receives the goods.") : tr("The office reviews this at the evening check.")}</p>
      <div className="row">
        <Btn disabled={busy || !(Number(amount) > 0)} onClick={() => act(async () => { await api(`/field/visits/${visitId}/adjustments`, { body: { billId, kind, amountPaise: rupeesToPaise(Number(amount)), note } }); setOpen(false); setAmount(""); setNote(""); }, "Saved")}>{tr("Save")}</Btn>
        <Btn tone="ghost" onClick={() => setOpen(false)}>{tr("Cancel")}</Btn>
      </div>
    </div>
  );
}

function PaymentRow({ payment, bills, shop }: { payment: any; bills: any[]; shop: any }) {
  const lines = payment.allocations.map((a: any) => {
    const bill = bills.find((b) => b._id === a.billId);
    return `${bill?.billNo ?? "Bill"}${bill ? ` (${bill.billDate})` : ""}: ${formatRupees(a.amountPaise)}`;
  });
  const message = [`Receipt ${payment.receiptNo ?? ""} from ${shop.name}`, ...lines, `Total ${payment.mode}: ${formatRupees(payment.amountPaise)}`].join("\n");
  const phone = String(shop.phone ?? "").replace(/\D/g, "");
  return (
    <div className="card">
      <div className="row between">
        <span>{tr(PAYMENT_MODE_LABEL[payment.mode] ?? payment.mode)} <Rs paise={payment.amountPaise} /></span>
        <Status value={payment.status} />
      </div>
      <p className="small muted">
        {payment.receiptNo && <>{tr("Receipt ")}<span className="mono">{payment.receiptNo}</span>. </>}
        {payment.chequeNo && <>{tr("Cheque ")}<span className="mono">{payment.chequeNo}</span>, {payment.chequeBank}{tr(", dated ")}{payment.chequeDate}. </>}
        {payment.upiTransactionRef && <>{tr("UPI reference ")}<span className="mono">{payment.upiTransactionRef}</span>. </>}
        {lines.join(", ")}
      </p>
      {payment.mode === "cash" && phone && (
        <a className="btn ghost small-btn" target="_blank" rel="noreferrer" href={`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`}>{tr("Send receipt on WhatsApp")}</a>
      )}
    </div>
  );
}

function OrderTab({ data, reload }: { data: any; reload: () => Promise<void> }) {
  const { visit, products, order } = data;
  const { act, busy } = useAct(reload);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<string>(NO_ORDER_REASONS[0]);
  const [clientRef] = useState(newRef);
  const inShop = visit.status === "checked_in";
  const lines = Object.entries(qty).filter(([, q]) => q > 0);

  if (order) {
    return (
      <div className="card">
        <div className="row between"><h2>{tr("Order ")}{order.orderNo}</h2><Stamp tone="ok">{tr("Saved")}</Stamp></div>
        {order.lines.map((l: any) => <div key={l.productId} className="row between small"><span>{l.name}</span><span className="mono">{l.quantity} {l.unit}</span></div>)}
      </div>
    );
  }
  if (visit.noOrderReason) return <div className="card"><p>{tr("No order. Reason: ")}<strong>{tr(visit.noOrderReason)}</strong></p></div>;
  if (!inShop) return <div className="card muted">{tr("No order was recorded in this visit.")}</div>;

  const change = (id: string, delta: number) => setQty((q) => ({ ...q, [id]: Math.max(0, (q[id] ?? 0) + delta) }));

  return (
    <div className="stack">
      <h2>{tr("Ask for each product, in this order")}</h2>
      {products.map((p: any) => (
        <div key={p._id} className="card row between">
          <span style={{ flex: 1, minWidth: 150 }}>
            <strong>{p.name}</strong><br />
            <span className="small muted">{p.unit}{p.lastQty != null && <>{tr(", last order ")}{p.lastQty}</>}</span>
          </span>
          <span className="row" style={{ gap: 6 }}>
            <Btn tone="ghost" size="small" aria-label={tr(`Less ${p.name}`)} onClick={() => change(p._id, -1)}>-</Btn>
            <input aria-label={tr(`Quantity of ${p.name}`)} type="number" inputMode="numeric" min="0" value={qty[p._id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [p._id]: Number(e.target.value) || 0 }))} style={{ width: 70, textAlign: "center" }} />
            <Btn tone="ghost" size="small" aria-label={tr(`More ${p.name}`)} onClick={() => change(p._id, 1)}>+</Btn>
          </span>
        </div>
      ))}
      <Btn full disabled={busy || lines.length === 0} onClick={() => act(() => api(`/field/visits/${visit._id}/order`, { body: { clientRef, lines: lines.map(([productId, quantity]) => ({ productId, quantity })) } }), "Order saved")}>{tr("Save order (")}{lines.length} {lines.length === 1 ? tr("item") : tr("items")})
      </Btn>
      <div className="card">
        <Field label="Or record why there is no order">
          <select value={reason} onChange={(e) => setReason(e.target.value)}>{NO_ORDER_REASONS.map((r) => <option key={r} value={r}>{tr(r)}</option>)}</select>
        </Field>
        <Btn tone="ghost" disabled={busy} onClick={() => act(() => api(`/field/visits/${visit._id}/no-order`, { body: { reason } }), "Saved")}>{tr("Save no order")}</Btn>
      </div>
    </div>
  );
}
