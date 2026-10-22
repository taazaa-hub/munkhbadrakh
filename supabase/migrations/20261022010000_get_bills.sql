-- Нэг утасны дугаар хэд хэдэн тоотод бүртгэлтэй байдаг (сар бүр 4–8 утас).
-- get_bill зөвхөн эхний тоотыг буцаадаг тул бусад тоот төлбөрөө харж/төлж
-- чадахгүй байв. get_bills тухайн утасны БҮХ тоотыг массиваар буцаана.
--
-- Мөн хоосон утас ('' эсвэл зөвхөн тэмдэгт) илгээхэд утасгүй бүртгэлтэй
-- тоотын мэдээлэл буцаж байсныг хаана.

create or replace function get_bills(p_sar text, p_utas text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(wb) order by wb.toot), '[]'::jsonb)
  from public.water_bills wb
  where wb.sar = p_sar
    and regexp_replace(coalesce(p_utas, ''), '[^0-9]', '', 'g') <> ''
    and regexp_replace(coalesce(wb.utas, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_utas, ''), '[^0-9]', '', 'g');
$$;

grant execute on function get_bills(text, text) to anon, authenticated;

-- Хуучин (cache-лэгдсэн) хуудсуудад зориулж get_bill-ийг үлдээнэ.
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
    and regexp_replace(coalesce(p_utas, ''), '[^0-9]', '', 'g') <> ''
    and regexp_replace(coalesce(wb.utas, ''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_utas, ''), '[^0-9]', '', 'g')
  order by wb.toot
  limit 1;
$$;
