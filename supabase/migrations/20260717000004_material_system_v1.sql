-- Eighty ERP: 인테리어 마감자재 선택·고객 전체 승인 시스템 1차
-- PostgreSQL / Supabase SQL Editor 안전 실행용
-- 재실행 가능 (IF EXISTS / IF NOT EXISTS / DROP IF EXISTS)
-- 기존 CRM 고객 데이터 삭제 없음

-- =============================================================================
-- 1) material_catalog 확장
-- =============================================================================
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS subtype text;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS base_price integer NOT NULL DEFAULT 0;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS supplier text;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS is_favorite boolean NOT NULL DEFAULT false;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS cover_image_path text;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
ALTER TABLE public.material_catalog ADD COLUMN IF NOT EXISTS delete_reason text;

UPDATE public.material_catalog SET trade = '욕실' WHERE trade = '욕실제품';
UPDATE public.material_catalog SET trade = '스위치' WHERE trade = '스위치/콘센트';

ALTER TABLE public.material_catalog DROP CONSTRAINT IF EXISTS material_catalog_trade_check;
ALTER TABLE public.material_catalog DROP CONSTRAINT IF EXISTS material_catalog_subtype_check;

ALTER TABLE public.material_catalog
  ADD CONSTRAINT material_catalog_trade_check
  CHECK (trade IN (
    '창호','바닥재','도배','타일','필름','도어','중문','주방가구','붙박이장',
    '욕실','수전','도기','샤워부스','조명','스위치','콘센트','커튼','블라인드',
    '에어컨','환기','가전','도장','목공','철거','확장','전기','기타'
  ));

ALTER TABLE public.material_catalog
  ADD CONSTRAINT material_catalog_subtype_check
  CHECK (
    subtype IS NULL
    OR subtype IN (
      '강마루','원목마루','합판마루','강화마루','장판',
      '포세린타일','데코타일','카펫타일','기타'
    )
  );

UPDATE public.material_catalog
SET cover_image_path = coalesce(cover_image_path, image_path)
WHERE cover_image_path IS NULL
  AND image_path IS NOT NULL;

-- =============================================================================
-- 2) material_catalog_images
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.material_catalog_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id uuid NOT NULL REFERENCES public.material_catalog (id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  kind text NOT NULL DEFAULT 'gallery'
    CHECK (kind IN ('cover','gallery','case_study')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_catalog_images_catalog_idx
  ON public.material_catalog_images (catalog_id, sort_order);

-- =============================================================================
-- 3) project_material_sets
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.project_material_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT '1차 선택안',
  version_label text NOT NULL DEFAULT '1차 선택안'
    CHECK (version_label IN ('1차 선택안','수정 1차','수정 2차','최종 선택안')),
  version_number integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT '작성중'
    CHECK (status IN (
      '작성중','승인요청','승인완료','변경요청','보류','재승인필요','취소'
    )),
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  delete_reason text
);

CREATE INDEX IF NOT EXISTS project_material_sets_project_idx
  ON public.project_material_sets (project_id, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS project_material_sets_one_current_idx
  ON public.project_material_sets (project_id)
  WHERE is_current = true AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS project_material_sets_set_updated_at ON public.project_material_sets;
CREATE TRIGGER project_material_sets_set_updated_at
  BEFORE UPDATE ON public.project_material_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.project_material_sets (
  customer_id, project_id, title, version_label, version_number, status, is_current
)
SELECT p.customer_id, p.id, '1차 선택안', '1차 선택안', 1, '작성중', true
FROM public.projects p
WHERE p.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.project_material_sets s
    WHERE s.project_id = p.id
      AND s.deleted_at IS NULL
  );

-- =============================================================================
-- 4) project_materials 확장
-- =============================================================================
ALTER TABLE public.project_materials
  ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.project_material_sets (id) ON DELETE CASCADE;
ALTER TABLE public.project_materials ADD COLUMN IF NOT EXISTS subtype text;
ALTER TABLE public.project_materials
  ADD COLUMN IF NOT EXISTS include_in_contract boolean NOT NULL DEFAULT true;
ALTER TABLE public.project_materials ADD COLUMN IF NOT EXISTS delete_reason text;
ALTER TABLE public.project_materials
  ADD COLUMN IF NOT EXISTS changed_since_approval boolean NOT NULL DEFAULT false;

UPDATE public.project_materials
SET include_in_contract = include_in_quote
WHERE include_in_contract IS DISTINCT FROM include_in_quote;

ALTER TABLE public.project_materials DROP CONSTRAINT IF EXISTS project_materials_subtype_check;

ALTER TABLE public.project_materials
  ADD CONSTRAINT project_materials_subtype_check
  CHECK (
    subtype IS NULL
    OR subtype IN (
      '강마루','원목마루','합판마루','강화마루','장판',
      '포세린타일','데코타일','카펫타일','기타'
    )
  );

UPDATE public.project_materials pm
SET set_id = s.id
FROM public.project_material_sets s
WHERE pm.project_id = s.project_id
  AND s.is_current = true
  AND s.deleted_at IS NULL
  AND pm.set_id IS NULL;

-- =============================================================================
-- 5) project_material_images + 레거시 이관
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.project_material_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id uuid NOT NULL REFERENCES public.project_materials (id) ON DELETE CASCADE,
  file_path text NOT NULL,
  file_name text NOT NULL,
  file_type text,
  is_cover boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_material_images_material_idx
  ON public.project_material_images (material_id, sort_order);

-- material_images 가 있을 때만 동적 SQL로 이관 (테이블 없으면 파싱 오류 방지)
DO $$
BEGIN
  IF to_regclass('public.material_images') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO public.project_material_images (
        id, material_id, file_path, file_name, file_type, is_cover, sort_order, created_at
      )
      SELECT
        i.id, i.material_id, i.file_path, i.file_name, i.file_type,
        i.is_cover, i.sort_order, i.created_at
      FROM public.material_images i
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.project_material_images p
        WHERE p.id = i.id
      )
    $sql$;
  END IF;
END $$;

-- =============================================================================
-- 6) material_approval_versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.material_approval_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.project_material_sets (id) ON DELETE RESTRICT,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  access_token_id uuid REFERENCES public.customer_access_tokens (id) ON DELETE SET NULL,
  version_label text NOT NULL,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  customer_name text,
  approver_name text,
  agreed_checks jsonb NOT NULL DEFAULT '{}'::jsonb,
  agreed_to_terms boolean NOT NULL DEFAULT false,
  ip_address text,
  user_agent text,
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS material_approval_versions_set_idx
  ON public.material_approval_versions (set_id, approved_at DESC);

-- =============================================================================
-- 7) change_requests / tokens 보완
-- =============================================================================
ALTER TABLE public.material_change_requests
  ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.project_material_sets (id) ON DELETE SET NULL;
ALTER TABLE public.material_change_requests ADD COLUMN IF NOT EXISTS desired_product text;
ALTER TABLE public.material_change_requests ADD COLUMN IF NOT EXISTS desired_color text;

ALTER TABLE public.customer_access_tokens
  ADD COLUMN IF NOT EXISTS set_id uuid REFERENCES public.project_material_sets (id) ON DELETE SET NULL;

UPDATE public.customer_access_tokens t
SET set_id = s.id
FROM public.project_material_sets s
WHERE t.project_id = s.project_id
  AND s.is_current = true
  AND s.deleted_at IS NULL
  AND t.set_id IS NULL;

-- =============================================================================
-- 8) audit_logs 보완
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  entity_id uuid,
  action text NOT NULL,
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_entity_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

-- =============================================================================
-- 9) Storage buckets
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'material-catalog',
    'material-catalog',
    false,
    20971520,
    ARRAY['image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
  ),
  (
    'project-materials',
    'project-materials',
    false,
    20971520,
    ARRAY['image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
  ),
  (
    'material-change-requests',
    'material-change-requests',
    false,
    20971520,
    ARRAY['image/jpeg','image/png','image/webp','image/gif','application/octet-stream']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- =============================================================================
-- 10) RLS
-- =============================================================================
ALTER TABLE public.material_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_catalog_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_material_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_approval_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "material_catalog_select" ON public.material_catalog;
CREATE POLICY "material_catalog_select" ON public.material_catalog
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL);

DROP POLICY IF EXISTS "material_catalog_write" ON public.material_catalog;
DROP POLICY IF EXISTS "material_catalog_insert" ON public.material_catalog;
CREATE POLICY "material_catalog_insert" ON public.material_catalog
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_catalog_update" ON public.material_catalog;
CREATE POLICY "material_catalog_update" ON public.material_catalog
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_catalog_images_all" ON public.material_catalog_images;
DROP POLICY IF EXISTS "material_catalog_images_select" ON public.material_catalog_images;
CREATE POLICY "material_catalog_images_select" ON public.material_catalog_images
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "material_catalog_images_insert" ON public.material_catalog_images;
CREATE POLICY "material_catalog_images_insert" ON public.material_catalog_images
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_catalog_images_update" ON public.material_catalog_images;
CREATE POLICY "material_catalog_images_update" ON public.material_catalog_images
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "material_catalog_images_delete" ON public.material_catalog_images;
CREATE POLICY "material_catalog_images_delete" ON public.material_catalog_images
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "project_material_sets_select" ON public.project_material_sets;
CREATE POLICY "project_material_sets_select" ON public.project_material_sets
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (public.is_admin() OR public.can_access_customer(customer_id))
  );

DROP POLICY IF EXISTS "project_material_sets_insert" ON public.project_material_sets;
CREATE POLICY "project_material_sets_insert" ON public.project_material_sets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.can_access_customer(customer_id));

DROP POLICY IF EXISTS "project_material_sets_update" ON public.project_material_sets;
CREATE POLICY "project_material_sets_update" ON public.project_material_sets
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.can_access_customer(customer_id))
  WITH CHECK (public.is_admin() OR public.can_access_customer(customer_id));

DROP POLICY IF EXISTS "project_material_images_select" ON public.project_material_images;
CREATE POLICY "project_material_images_select" ON public.project_material_images
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_materials m
      WHERE m.id = material_id
        AND m.deleted_at IS NULL
        AND (public.is_admin() OR public.can_access_customer(m.customer_id))
    )
  );

DROP POLICY IF EXISTS "project_material_images_insert" ON public.project_material_images;
CREATE POLICY "project_material_images_insert" ON public.project_material_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.project_materials m
      WHERE m.id = material_id
        AND (public.is_admin() OR public.can_access_customer(m.customer_id))
    )
  );

DROP POLICY IF EXISTS "project_material_images_update" ON public.project_material_images;
CREATE POLICY "project_material_images_update" ON public.project_material_images
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_materials m
      WHERE m.id = material_id
        AND (public.is_admin() OR public.can_access_customer(m.customer_id))
    )
  );

DROP POLICY IF EXISTS "project_material_images_delete" ON public.project_material_images;
CREATE POLICY "project_material_images_delete" ON public.project_material_images
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.project_materials m
      WHERE m.id = material_id
        AND (public.is_admin() OR public.can_access_customer(m.customer_id))
    )
  );

DROP POLICY IF EXISTS "material_approval_versions_select" ON public.material_approval_versions;
CREATE POLICY "material_approval_versions_select" ON public.material_approval_versions
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.can_access_customer(customer_id));

DROP POLICY IF EXISTS "material_approval_versions_insert" ON public.material_approval_versions;
CREATE POLICY "material_approval_versions_insert" ON public.material_approval_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.can_access_customer(customer_id));

DROP POLICY IF EXISTS "material_approvals_delete" ON public.material_approvals;
DROP POLICY IF EXISTS "material_approval_versions_delete" ON public.material_approval_versions;

DROP POLICY IF EXISTS "v1_material_storage_select" ON storage.objects;
CREATE POLICY "v1_material_storage_select" ON storage.objects
  FOR SELECT TO authenticated, anon
  USING (
    bucket_id IN (
      'material-catalog',
      'project-materials',
      'material-change-requests',
      'material-images',
      'customer-change-requests'
    )
    AND (
      public.is_admin()
      OR auth.role() = 'authenticated'
      OR (
        auth.role() = 'anon'
        AND bucket_id IN (
          'project-materials',
          'material-change-requests',
          'material-images',
          'customer-change-requests'
        )
        AND public.project_id_from_storage_path(name) IS NOT NULL
        AND public.project_has_valid_material_token(
          public.project_id_from_storage_path(name)
        )
      )
    )
  );

DROP POLICY IF EXISTS "v1_material_storage_insert" ON storage.objects;
CREATE POLICY "v1_material_storage_insert" ON storage.objects
  FOR INSERT TO authenticated, anon
  WITH CHECK (
    bucket_id IN (
      'material-catalog',
      'project-materials',
      'material-change-requests',
      'material-images',
      'customer-change-requests'
    )
    AND (
      (auth.role() = 'authenticated' AND auth.uid() IS NOT NULL)
      OR (
        auth.role() = 'anon'
        AND bucket_id IN ('material-change-requests', 'customer-change-requests')
        AND public.project_id_from_storage_path(name) IS NOT NULL
        AND public.project_has_valid_material_token(
          public.project_id_from_storage_path(name)
        )
      )
    )
  );

DROP POLICY IF EXISTS "v1_material_storage_delete" ON storage.objects;
CREATE POLICY "v1_material_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN (
      'material-catalog',
      'project-materials',
      'material-change-requests',
      'material-images',
      'customer-change-requests'
    )
    AND auth.uid() IS NOT NULL
  );

-- =============================================================================
-- 11) 고객 포털 RPC
-- =============================================================================
CREATE OR REPLACE FUNCTION public.customer_portal_bootstrap_v1(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.customer_access_tokens;
  cust public.customers;
  proj public.projects;
  s public.project_material_sets;
  emp_name text;
  mats jsonb;
  total_extra bigint;
  total_cnt int;
  approved_cnt int;
BEGIN
  t := public._assert_material_token(p_token);

  SELECT * INTO cust FROM public.customers WHERE id = t.customer_id;

  SELECT * INTO proj
  FROM public.projects
  WHERE id = t.project_id
    AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '현장을 찾을 수 없습니다.';
  END IF;

  SELECT * INTO s
  FROM public.project_material_sets
  WHERE id = coalesce(
    t.set_id,
    (
      SELECT id
      FROM public.project_material_sets
      WHERE project_id = t.project_id
        AND is_current = true
        AND deleted_at IS NULL
      LIMIT 1
    )
  )
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '선택안을 찾을 수 없습니다.';
  END IF;

  SELECT e.name INTO emp_name
  FROM public.employees e
  WHERE e.id = coalesce(proj.assigned_employee_id, cust.assigned_employee_id);

  SELECT
    coalesce(jsonb_agg(row_to_json(x)::jsonb ORDER BY x.sort_order, x.created_at), '[]'::jsonb),
    coalesce(sum(x.extra_amount), 0),
    count(*)::int,
    count(*) FILTER (WHERE x.approval_status = '승인완료')::int
  INTO mats, total_extra, total_cnt, approved_cnt
  FROM (
    SELECT
      m.*,
      coalesce(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id', i.id,
              'file_path', i.file_path,
              'file_name', i.file_name,
              'is_cover', i.is_cover,
              'sort_order', i.sort_order
            )
            ORDER BY i.sort_order, i.created_at
          )
          FROM public.project_material_images i
          WHERE i.material_id = m.id
        ),
        '[]'::jsonb
      ) AS material_images
    FROM public.project_materials m
    WHERE m.project_id = t.project_id
      AND (m.set_id = s.id OR m.set_id IS NULL)
      AND m.deleted_at IS NULL
      AND m.approval_status IN ('승인요청','승인완료','변경요청','보류','재승인필요')
  ) x;

  RETURN jsonb_build_object(
    'token_id', t.id,
    'customer_id', t.customer_id,
    'project_id', t.project_id,
    'set_id', s.id,
    'customer_name', cust.name,
    'project_name', proj.name,
    'assignee_name', coalesce(emp_name, ''),
    'version_label', s.version_label,
    'version_number', s.version_number,
    'set_status', s.status,
    'expires_at', t.expires_at,
    'materials', mats,
    'total_extra_amount', total_extra,
    'total_count', coalesce(total_cnt, 0),
    'approved_count', coalesce(approved_cnt, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_portal_approve_all_v1(
  p_token text,
  p_actor_name text DEFAULT NULL,
  p_check_all_reviewed boolean DEFAULT false,
  p_check_product_info boolean DEFAULT false,
  p_check_extra_amount boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.customer_access_tokens;
  s public.project_material_sets;
  cust public.customers;
  actor text;
  mats jsonb;
  ver_id uuid;
  approved_count int;
BEGIN
  IF NOT coalesce(p_check_all_reviewed, false)
     OR NOT coalesce(p_check_product_info, false)
     OR NOT coalesce(p_check_extra_amount, false) THEN
    RAISE EXCEPTION '승인 전 확인 항목에 모두 동의해 주세요.';
  END IF;

  t := public._assert_material_token(p_token);
  actor := coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객');

  SELECT * INTO s
  FROM public.project_material_sets
  WHERE id = coalesce(
    t.set_id,
    (
      SELECT id
      FROM public.project_material_sets
      WHERE project_id = t.project_id
        AND is_current = true
        AND deleted_at IS NULL
      LIMIT 1
    )
  )
  AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION '선택안을 찾을 수 없습니다.';
  END IF;

  SELECT * INTO cust FROM public.customers WHERE id = t.customer_id;

  SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.sort_order, m.created_at), '[]'::jsonb)
  INTO mats
  FROM public.project_materials m
  WHERE m.project_id = t.project_id
    AND (m.set_id = s.id OR m.set_id IS NULL)
    AND m.deleted_at IS NULL
    AND m.approval_status IN ('승인요청','재승인필요','승인완료','변경요청','보류');

  UPDATE public.project_materials
  SET
    approval_status = '승인완료',
    changed_since_approval = false
  WHERE project_id = t.project_id
    AND (set_id = s.id OR set_id IS NULL)
    AND deleted_at IS NULL
    AND approval_status IN ('승인요청','재승인필요');

  GET DIAGNOSTICS approved_count = ROW_COUNT;

  IF approved_count = 0 AND s.status = '승인완료' THEN
    RAISE EXCEPTION '이미 승인 완료된 선택안입니다.';
  END IF;

  IF approved_count = 0 THEN
    UPDATE public.project_materials
    SET
      approval_status = '승인완료',
      changed_since_approval = false
    WHERE project_id = t.project_id
      AND (set_id = s.id OR set_id IS NULL)
      AND deleted_at IS NULL
      AND approval_status <> '취소';

    GET DIAGNOSTICS approved_count = ROW_COUNT;
  END IF;

  UPDATE public.project_material_sets
  SET status = '승인완료', updated_at = now()
  WHERE id = s.id;

  INSERT INTO public.material_approval_versions (
    set_id, project_id, customer_id, access_token_id,
    version_label, version_number, snapshot,
    customer_name, approver_name, agreed_checks, agreed_to_terms,
    ip_address, user_agent
  ) VALUES (
    s.id, t.project_id, t.customer_id, t.id,
    s.version_label, s.version_number,
    jsonb_build_object(
      'materials', mats,
      'version_label', s.version_label,
      'version_number', s.version_number,
      'approved_at', now()
    ),
    cust.name, actor,
    jsonb_build_object(
      'all_reviewed', true,
      'product_info', true,
      'extra_amount', true
    ),
    true, p_ip_address, p_user_agent
  )
  RETURNING id INTO ver_id;

  INSERT INTO public.material_approvals (
    material_id, project_id, customer_id, action, status_after,
    actor_type, actor_name, access_token_id,
    approval_snapshot, agreed_to_terms, ip_address, user_agent
  ) VALUES (
    NULL, t.project_id, t.customer_id, '전체승인', '승인완료',
    'customer', actor, t.id,
    jsonb_build_object('approval_version_id', ver_id, 'set_id', s.id),
    true, p_ip_address, p_user_agent
  );

  INSERT INTO public.notification_events (
    event_type, customer_id, project_id, payload, status
  ) VALUES (
    'material_all_approved', t.customer_id, t.project_id,
    jsonb_build_object(
      'set_id', s.id,
      'approval_version_id', ver_id,
      'actor_name', actor
    ),
    'pending'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'approval_version_id', ver_id,
    'approved_count', approved_count,
    'version_label', s.version_label
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.customer_portal_change_request_v1(
  p_token text,
  p_space_name text,
  p_trade text,
  p_change_body text,
  p_desired_product text DEFAULT NULL,
  p_desired_color text DEFAULT NULL,
  p_actor_name text DEFAULT NULL,
  p_reference_image_paths text[] DEFAULT '{}',
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t public.customer_access_tokens;
  s public.project_material_sets;
  req_id uuid;
  actor text;
BEGIN
  t := public._assert_material_token(p_token);

  IF coalesce(trim(p_space_name), '') = '' THEN
    RAISE EXCEPTION '공간을 선택해 주세요.';
  END IF;
  IF coalesce(trim(p_trade), '') = '' THEN
    RAISE EXCEPTION '공종을 선택해 주세요.';
  END IF;
  IF coalesce(trim(p_change_body), '') = '' THEN
    RAISE EXCEPTION '변경 내용을 입력해 주세요.';
  END IF;

  actor := coalesce(nullif(trim(coalesce(p_actor_name, '')), ''), '고객');

  SELECT * INTO s
  FROM public.project_material_sets
  WHERE id = coalesce(
    t.set_id,
    (
      SELECT id
      FROM public.project_material_sets
      WHERE project_id = t.project_id
        AND is_current = true
        AND deleted_at IS NULL
      LIMIT 1
    )
  )
  AND deleted_at IS NULL;

  INSERT INTO public.material_change_requests (
    project_id, customer_id, access_token_id, set_id,
    space_name, trade, change_body, desired_product, desired_color,
    image_paths, actor_name, status, ip_address, user_agent
  ) VALUES (
    t.project_id, t.customer_id, t.id, s.id,
    p_space_name, p_trade, trim(p_change_body),
    nullif(trim(coalesce(p_desired_product, '')), ''),
    nullif(trim(coalesce(p_desired_color, '')), ''),
    coalesce(p_reference_image_paths, '{}'),
    actor, '접수', p_ip_address, p_user_agent
  )
  RETURNING id INTO req_id;

  UPDATE public.project_materials
  SET approval_status = '변경요청'
  WHERE project_id = t.project_id
    AND (set_id = s.id OR set_id IS NULL)
    AND deleted_at IS NULL
    AND space_name = p_space_name
    AND trade = p_trade
    AND approval_status IN ('승인요청','재승인필요','승인완료','보류');

  IF s.id IS NOT NULL THEN
    UPDATE public.project_material_sets
    SET status = '변경요청'
    WHERE id = s.id;
  END IF;

  INSERT INTO public.material_approvals (
    material_id, project_id, customer_id, action, status_after,
    actor_type, actor_name, access_token_id,
    change_reason, desired_product, desired_color, customer_note,
    reference_image_paths, ip_address, user_agent
  ) VALUES (
    NULL, t.project_id, t.customer_id, '변경요청', '변경요청',
    'customer', actor, t.id,
    trim(p_change_body),
    nullif(trim(coalesce(p_desired_product, '')), ''),
    nullif(trim(coalesce(p_desired_color, '')), ''),
    format('공간:%s / 공종:%s', p_space_name, p_trade),
    coalesce(p_reference_image_paths, '{}'),
    p_ip_address, p_user_agent
  );

  INSERT INTO public.notification_events (
    event_type, customer_id, project_id, payload, status
  ) VALUES (
    'material_change_request', t.customer_id, t.project_id,
    jsonb_build_object(
      'change_request_id', req_id,
      'space_name', p_space_name,
      'trade', p_trade
    ),
    'pending'
  );

  RETURN jsonb_build_object('ok', true, 'change_request_id', req_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.customer_portal_bootstrap_v1(text)
  TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_portal_approve_all_v1(
  text, text, boolean, boolean, boolean, text, text
) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.customer_portal_change_request_v1(
  text, text, text, text, text, text, text, text[], text, text
) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
