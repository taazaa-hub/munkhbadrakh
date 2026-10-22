-- Munkhbadrah OSK -- sariin tolbor/tololt/uldegdel-iin san
-- Supabase SQL Editor dotor neg udaa ajilluulna.

create table if not exists toot_tolbor (
  id bigserial primary key,
  sar text not null,                 -- jishee: '2026-08'
  toot text not null,                -- toot, jishee: '50201'
  utas text,                         -- utasnii dugaar
  orts text,
  davhar text,
  ovog_ner text,
  regis text,
  uhh text,
  ehnii_uldegdel numeric,            -- 12 sariin uldegdel
  tolbor numeric,                    -- tuhain sariin tolbor
  tololt numeric,                    -- tuhain sariin tolson dun
  uldegdel numeric,                  -- tuhain sariin etssiin uldegdel
  niit_tololt numeric,               -- niit tololt
  tailbar text,
  email text,
  updated_at timestamptz default now(),
  unique (sar, toot)
);

alter table toot_tolbor enable row level security;

alter table toot_tolbor add column if not exists utas text;
alter table toot_tolbor add column if not exists orts text;
alter table toot_tolbor add column if not exists davhar text;
alter table toot_tolbor add column if not exists ovog_ner text;
alter table toot_tolbor add column if not exists regis text;
alter table toot_tolbor add column if not exists uhh text;
alter table toot_tolbor add column if not exists ehnii_uldegdel numeric;
alter table toot_tolbor add column if not exists tolbor numeric;
alter table toot_tolbor add column if not exists tololt numeric;
alter table toot_tolbor add column if not exists uldegdel numeric;
alter table toot_tolbor add column if not exists niit_tololt numeric;
alter table toot_tolbor add column if not exists tailbar text;
alter table toot_tolbor add column if not exists email text;

create index if not exists toot_tolbor_utas_idx on toot_tolbor (sar, utas);
create index if not exists toot_tolbor_sar_idx on toot_tolbor (sar);

drop policy if exists "public read" on toot_tolbor;
create policy "public read" on toot_tolbor
  for select using (true);

drop policy if exists "public write" on toot_tolbor;
create policy "public write" on toot_tolbor
  for insert with check (true);

drop policy if exists "public update" on toot_tolbor;
create policy "public update" on toot_tolbor
  for update using (true);

create table if not exists toot_zadargaa (
  id bigserial primary key,
  sar text not null,
  toot text not null,
  utas text,
  niit_hemjee numeric,
  suuri_huraamj numeric,
  hooiten_umnoh numeric,
  hooiten_odoo numeric,
  hooiten_zuruu numeric,
  haluun_umnoh numeric,
  haluun_odoo numeric,
  haluun_zuruu numeric,
  bohir_us numeric,
  niit_us_tolbor numeric,
  dulaan_suuri numeric,
  dulaan_tolbor_m2 numeric,
  haluun_us_tooluur_heat numeric,
  dulaan_niit numeric,
  niit_tolbor numeric,
  updated_at timestamptz default now(),
  unique (sar, toot)
);

alter table toot_zadargaa enable row level security;

create index if not exists toot_zadargaa_utas_idx on toot_zadargaa (sar, utas);
create index if not exists toot_zadargaa_toot_idx on toot_zadargaa (sar, toot);

drop policy if exists "public read" on toot_zadargaa;
create policy "public read" on toot_zadargaa
  for select using (true);

drop policy if exists "public write" on toot_zadargaa;
create policy "public write" on toot_zadargaa
  for insert with check (true);

drop policy if exists "public update" on toot_zadargaa;
create policy "public update" on toot_zadargaa
  for update using (true);
