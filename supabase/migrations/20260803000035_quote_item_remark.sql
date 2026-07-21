-- Eighty ERP — 견적 항목 비고
alter table public.quote_items
  add column if not exists remark text;

comment on column public.quote_items.remark is '견적 항목 비고';
