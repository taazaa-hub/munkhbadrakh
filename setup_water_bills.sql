-- Мөнхбадрах ОСК — `water_bills` хүснэгтийн бүтэц
-- index.html (харах хуудас) ба admin.html (Excel оруулах хуудас) хоёрын
-- ашигладаг БҮХ баганыг энэ скрипт баталгаажуулна.
--
-- Supabase project → SQL Editor → энэ файлыг бүхэлд нь paste хийгээд Run.
-- Дахин дахин ажиллуулж болно (бүх алхам `if not exists`).

create table if not exists water_bills (
  id bigserial primary key,
  sar text not null,                 -- жишээ: '2026-08'
  toot text not null,                -- тоот, жишээ: '50201'
  unique (sar, toot)
);

-- Хэн, хаана
alter table water_bills add column if not exists utas text;
alter table water_bills add column if not exists ovog text;
alter table water_bills add column if not exists ner text;
alter table water_bills add column if not exists niit_hemjee numeric;   -- Нийт хэмжээ /м.кв/

-- Усны задаргаа
alter table water_bills add column if not exists suuri_huraamj numeric;
alter table water_bills add column if not exists hooiten_umnoh numeric;
alter table water_bills add column if not exists hooiten_odoo numeric;
alter table water_bills add column if not exists hooiten_zuruu numeric;
alter table water_bills add column if not exists haluun_umnoh numeric;
alter table water_bills add column if not exists haluun_odoo numeric;
alter table water_bills add column if not exists haluun_zuruu numeric;
alter table water_bills add column if not exists bohir_us numeric;
alter table water_bills add column if not exists niit_us_tolbor numeric;

-- Дулааны задаргаа
alter table water_bills add column if not exists dulaan_suuri numeric;
alter table water_bills add column if not exists dulaan_tolbor_m2 numeric;
-- Бүх үсэг ЛАТИН ("tooluur"). Амьд өгөгдлийн сан ийм бичлэгтэй тул
--   index.html/admin.html-д ч мөн адил байх ёстой.
alter table water_bills add column if not exists haluun_us_tooluur_heat numeric;
alter table water_bills add column if not exists dulaan_niit numeric;

-- Нэгтгэл (мөнгөн дүн)
alter table water_bills add column if not exists niit_tolbor numeric;   -- тухайн сарын төлбөр
alter table water_bills add column if not exists tolson_dun numeric;    -- тухайн сарын төлөлт
alter table water_bills add column if not exists uldegdel numeric;      -- тухайн сарын үлдэгдэл

-- Төлбөрийн байдал (admin дээрээс гараар тэмдэглэдэг)
alter table water_bills add column if not exists paid boolean default false;
alter table water_bills add column if not exists paid_at timestamptz;
alter table water_bills add column if not exists updated_at timestamptz default now();

-- upsert (onConflict: 'sar,toot') ажиллахад заавал шаардлагатай
create unique index if not exists water_bills_sar_toot_key on water_bills (sar, toot);

create index if not exists water_bills_utas_idx on water_bills (sar, utas);
create index if not exists water_bills_sar_idx on water_bills (sar);

-- Public read endpoints used by index.html. Return one JSON object from get_bill
-- to match supabase.rpc(...). Keep the phone number comparison normalized.
create or replace function list_months()
returns table (sar text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct wb.sar from public.water_bills wb order by wb.sar desc;
$$;

create or replace function get_bill(p_sar text, p_utas text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(wb)
  from public.water_bills wb
  where wb.sar = p_sar
    and regexp_replace(coalesce(wb.utas, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_utas, ''), '[^0-9]', '', 'g')
  order by wb.toot
  limit 1;
$$;

grant execute on function list_months() to anon, authenticated;
grant execute on function get_bill(text, text) to anon, authenticated;

-- QPay invoice history used by qpay-create and qpay-callback Edge Functions.
create table if not exists qpay_invoices (
  id bigserial primary key,
  sar text not null,
  toot text not null,
  amount numeric not null,
  sender_invoice_no text not null unique,
  qpay_invoice_id text not null unique,
  qpay_payment_id text,
  qpay_response jsonb,
  status text not null default 'NEW' check (status in ('NEW', 'PAID')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists qpay_invoices_bill_idx
  on qpay_invoices (sar, toot, status, created_at desc);
alter table qpay_invoices enable row level security;

alter table water_bills enable row level security;

drop policy if exists "public read" on water_bills;
create policy "public read" on water_bills
  for select using (true);

drop policy if exists "public write" on water_bills;
create policy "public write" on water_bills
  for insert with check (true);

drop policy if exists "public update" on water_bills;
create policy "public update" on water_bills
  for update using (true);
