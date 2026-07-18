-- =============================================================================
-- Eighty ERP — quotes.assigned_employee_id → employees.id FK
-- 파일: 20260803000002_add_quotes_assigned_employee_fk.sql
--
-- 운영 DB에 수동 적용한 외래키를 코드베이스에 동기화.
-- 안전: DROP TABLE / DELETE / TRUNCATE / 데이터 변경 없음.
-- 재실행: 동일 FK가 있으면 아무 작업도 하지 않음.
-- =============================================================================

do $$
begin
  if to_regclass('public.quotes') is null then
    raise notice 'public.quotes 없음 — FK 건너뜀';
    return;
  end if;

  if to_regclass('public.employees') is null then
    raise notice 'public.employees 없음 — FK 건너뜀';
    return;
  end if;

  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quotes'
      and c.contype = 'f'
      and c.conname = 'quotes_assigned_employee_id_fkey'
  ) then
    return;
  end if;

  -- 동일 대상(employees.id)으로 이미 다른 이름의 FK가 있으면 건너뜀
  if exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class rt on rt.oid = c.confrelid
    join pg_namespace rn on rn.oid = rt.relnamespace
    where n.nspname = 'public'
      and t.relname = 'quotes'
      and c.contype = 'f'
      and rn.nspname = 'public'
      and rt.relname = 'employees'
      and pg_get_constraintdef(c.oid) ilike '%assigned_employee_id%'
  ) then
    return;
  end if;

  alter table public.quotes
    add constraint quotes_assigned_employee_id_fkey
    foreign key (assigned_employee_id)
    references public.employees (id)
    on delete set null;
end $$;

notify pgrst, 'reload schema';
