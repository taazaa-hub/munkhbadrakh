// QPay нэхэмжлэх үүсгэх. Браузераас зөвхөн { sar, phone, toot? } авна.
// Дүнг DB-ээс өөрөө авна (браузерын илгээсэн дүнд хэзээ ч найдахгүй).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const QPAY_BASE = (Deno.env.get("QPAY_BASE") ?? "https://merchant.qpay.mn").replace(/\/$/, "");

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required function secret: ${name}`);
  return value;
}

// Token-ийг ойр ойрхон авч болохгүй (QPay-ийн анхааруулга) тул кэшлэнэ.
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

// Хэдийг төлүүлэх вэ? Одоо хуудсан дээр харагддаг "Нийт төлбөл зохих дүн"-г авна.
// Хэрвээ үлдэгдлээр нь төлүүлэх бол энд солино.
function computeAmount(bill: { niit_tolbor: number | null }): number {
  return Math.round(Number(bill.niit_tolbor ?? 0));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  try {
    const body = await req.json();
    const sar = String(body.sar ?? "");
    const utas = String(body.phone ?? "").replace(/\D/g, "");
    const toot = body.toot == null ? "" : String(body.toot);
    if (!/^\d{4}-\d{2}$/.test(sar) || !/^\d{8}$/.test(utas) || (toot && !/^\d{1,8}$/.test(toot))) {
      return json({ error: "Буруу өгөгдөл" }, 400);
    }

    const db = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    // index.html-тэй ЯГ адил мөрүүдийг олохын тулд ижил get_bills RPC-г ашиглана
    // (утасны дугаарыг DB талд цэвэрлэж харьцуулдаг). Тоотыг зөвхөн тухайн
    // утсанд бүртгэлтэй тоотуудаас сонгоно — өөр айлын тоотыг төлүүлэхгүй.
    const { data: bills, error: billErr } = await db.rpc("get_bills", {
      p_sar: sar,
      p_utas: utas,
    });

    // DB алдааг "олдсонгүй"-тэй андуурахгүй (жишээ нь paid багана дутуу үед).
    if (billErr) {
      console.error("water_bills select error", billErr);
      return json({ error: "Серверийн алдаа" }, 500);
    }
    const list = (bills ?? []) as { toot: string; niit_tolbor: number | null; paid: boolean | null }[];
    const bill = toot ? list.find((b) => String(b.toot) === toot) : list[0];
    if (!bill) return json({ error: "Бүртгэл олдсонгүй" }, 404);
    if (bill.paid) return json({ error: "Энэ сарын төлбөр төлөгдсөн байна" }, 409);

    const amount = computeAmount(bill);
    if (!(amount > 0)) return json({ error: "Төлөх дүн алга" }, 422);

    // Давхар нэхэмжлэх үүсгэхгүйн тулд сүүлийн 24 цагийн ижил нэхэмжлэхийг дахин ашиглана.
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: old } = await db
      .from("qpay_invoices")
      .select("qpay_response")
      .eq("sar", sar)
      .eq("toot", bill.toot)
      .eq("amount", amount)
      .eq("status", "NEW")
      .gte("created_at", since)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (old?.qpay_response) return json({ ...old.qpay_response, amount });

    // sender_invoice_no: давтагдашгүй, зөвхөн үсэг/тоо.
    const senderNo = `${sar.replace("-", "")}T${bill.toot}N${Date.now()}`;
    const token = await getToken();

    const r = await fetch(`${QPAY_BASE}/v2/invoice`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        invoice_code: requiredEnv("QPAY_INVOICE_CODE"),
        sender_invoice_no: senderNo,
        invoice_receiver_code: String(bill.toot),
        invoice_description: `Usnii tolbor ${sar.replace("-", " ")} toot ${bill.toot}`,
        amount,
        callback_url:
          `${requiredEnv("SUPABASE_URL")}/functions/v1/qpay-callback/${requiredEnv("CALLBACK_SECRET")}`,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.invoice_id) {
      console.error("QPay invoice error", r.status, JSON.stringify(d));
      return json({ error: "QPay алдаа: " + (d.error ?? d.message ?? r.status) }, 502);
    }

    const result = {
      invoice_id: d.invoice_id,
      qr_image: d.qr_image,
      short_url: d.qPay_shortUrl,
      // Баримтад qPay_deeplink гэж бичсэн ч бодит хариунд заримдаа "urls" ирдэг.
      deeplinks: d.urls ?? d.qPay_deeplink ?? [],
    };

    // Энэ мөр байхгүй бол callback нэхэмжлэхийг танихгүй тул алдааг шалгана.
    const { error: insErr } = await db.from("qpay_invoices").insert({
      sar,
      toot: bill.toot,
      amount,
      sender_invoice_no: senderNo,
      qpay_invoice_id: d.invoice_id,
      qpay_response: result,
    });
    if (insErr) {
      console.error("qpay_invoices insert error", insErr);
      return json({ error: "Серверийн алдаа" }, 500);
    }

    return json({ ...result, amount });
  } catch (e) {
    console.error(e);
    return json({ error: "Серверийн алдаа" }, 500);
  }
});