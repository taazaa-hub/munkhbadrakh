-- water_bills дээр төлбөрийн төлөв. Live DB-д эдгээр багана дутуу байсан тул
-- qpay-create / qpay-callback / admin.html-ийн "төлсөн" тэмдэглэгээ ажиллахгүй байв.
alter table public.water_bills add column if not exists paid boolean default false;
alter table public.water_bills add column if not exists paid_at timestamptz;
