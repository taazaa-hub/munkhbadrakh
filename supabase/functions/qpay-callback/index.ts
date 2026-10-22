// QPay төлбөр төлөгдсөний дараа энэ хаягийг GET-ээр дууддаг:
//   .../qpay-callback/<CALLBACK_SECRET>?qpay_payment_id=XXXX
// Бид payment_id-г QPay-ээс дахин шалгаж баталгаажуулсны дараа л "төлсөн" гэж тэмдэглэнэ.
// QPay-д ЗААВАЛ HTTP 200 + body "SUCCESS" буцаана.
import { createClient } from "npm:@supabase/supabase-js@2";

const QPAY_BASE = (Deno.env.get("QPAY_BASE") ?? "https://merchant.qpay.mn").replace(/\/$/, "");

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required function secret: ${name}`);
  return value;
}

let cached: { token: string; exp: number } | null = null;
async function getToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 120 > now) return cached.token;
  const basic = btoa(`${requiredEnv("QPAY_USERNAME")}:${requiredEnv("QPAY_PASSWORD")}`);
  const r = await fetch(`${QPAY_BASE}/v2/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!r.ok) throw new Error("QPay auth failed: " + r.status);
  const d = await r.json();
  const exp = d.expires_in > 1e9 ? d.expires_in : now + Number(d.expires_in);
  cached = { token: d.access_token, exp };
  return d.access_token;
}

const ok = () => new Response("SUCCESS", { status: 200 });

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Хаягийн төгсгөлд нууц үг байх ёстой.
  const parts = url.pathname.split("/").filter(Boolean);
  const secret = parts[parts.length - 1];
  if (secret !== requiredEnv("CALLBACK_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }

  const paymentId =
    url.searchParams.get("qpay_payment_id") ??
    url.searchParams.get("payment_id") ??
    url.search.match(/qpay_payment_id=([^&]+)/)?.[1];
  if (!paymentId) return new Response("missing payment id", { status: 400 });

  try {
    const token = await getToken();
    const r = await fetch(`${QPAY_BASE}/v2/payment/${encodeURIComponent(paymentId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      console.error("payment get failed", r.status, await r.text());
      return new Response("retry", { status: 500 });
    }
    const p = await r.json();
    console.log("payment", paymentId, p.payment_status, p.object_id, p.payment_amount);

    if (p.payment_status !== "PAID" || p.object_type !== "INVOICE") return ok();

    const db = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: inv, error: invErr } = await db
      .from("qpay_invoices")
      .select("id,sar,toot,amount,status")
      .eq("qpay_invoice_id", p.object_id)
      .maybeSingle();
    if (invErr) {
      console.error("qpay_invoices select error", invErr);
      return new Response("retry", { status: 500 });
    }
    if (!inv) {
      console.error("unknown invoice", p.object_id);
      return ok();
    }
    if (inv.status === "PAID") return ok(); // давхар callback

    // Дүн нь нэхэмжилсэнээс бага бол төлсөн гэж тооцохгүй.
    if (Number(p.payment_amount) < Number(inv.amount)) {
      console.error("underpaid", paymentId, p.payment_amount, inv.amount);
      return ok();
    }

    // water_bills-ийг ЭХЛЭЭД шинэчилнэ: амжилтгүй бол 500 буцааж QPay-ээр дахин
    // дуудуулна. Нэхэмжлэхийг эхэлж PAID болговол дахин дуудлага "давхар
    // callback" гэж алгасагдаж, айлын төлбөр хэзээ ч "төлсөн" болохгүй.
    const now = new Date().toISOString();
    const { error: billErr } = await db
      .from("water_bills")
      .update({ paid: true, paid_at: now })
      .eq("sar", inv.sar)
      .eq("toot", inv.toot);
    if (billErr) {
      console.error("water_bills update error", billErr);
      return new Response("retry", { status: 500 });
    }
    const { error: updErr } = await db
      .from("qpay_invoices")
      .update({ status: "PAID", qpay_payment_id: paymentId, paid_at: now })
      .eq("id", inv.id);
    if (updErr) {
      console.error("qpay_invoices update error", updErr);
      return new Response("retry", { status: 500 });
    }

    return ok();
  } catch (e) {
    console.error(e);
    return new Response("retry", { status: 500 });
  }
});
