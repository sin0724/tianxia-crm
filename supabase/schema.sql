-- ============================================================
-- 티엔샤 CRM — Supabase PostgreSQL Schema (idempotent)
-- Supabase SQL Editor에 전체 붙여넣기 후 실행하세요.
-- 이미 생성된 DB에 재실행해도 오류 없이 동작합니다.
-- ============================================================


-- ── 1. ENUMS ────────────────────────────────────────────────
-- CREATE TYPE은 IF NOT EXISTS를 지원하지 않으므로 DO 블록으로 처리

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'manager', 'sales');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE company_status AS ENUM (
    '미연락',
    '1차 연락 완료',
    '부재',
    '답변 대기',
    '관심 있음',
    '미팅 예정',
    '미팅 완료',
    '제안서 발송',
    '계약 검토',
    '계약 완료',
    '보류',
    '실패',
    '제외'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- category / source / activity_type / activity_result는 자유 입력을 허용하기 위해
-- TEXT 컬럼을 사용합니다. (과거 ENUM에서 마이그레이션 — 아래 1-b 참조)

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 1-b. ENUM → TEXT 마이그레이션 (기존 DB용, 재실행 안전) ──
-- 과거에 ENUM으로 생성된 컬럼을 TEXT로 전환합니다. 이미 TEXT면 무해합니다.

DO $$ BEGIN
  ALTER TABLE companies  ALTER COLUMN category        TYPE TEXT USING category::text;
  ALTER TABLE companies  ALTER COLUMN source          TYPE TEXT USING source::text;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activities ALTER COLUMN activity_type   TYPE TEXT USING activity_type::text;
  ALTER TABLE activities ALTER COLUMN activity_result TYPE TEXT USING activity_result::text;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 더 이상 사용하지 않는 ENUM 타입 정리 (참조 중이면 그대로 둠)
DO $$ BEGIN DROP TYPE IF EXISTS company_category; EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS company_source;   EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS activity_type;    EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;
DO $$ BEGIN DROP TYPE IF EXISTS activity_result;  EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;


-- ── 2. TABLES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  email         TEXT        NOT NULL,
  role          user_role   NOT NULL DEFAULT 'sales',
  team          TEXT,
  slack_user_id TEXT,
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
  id                UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT            NOT NULL,
  category          TEXT,
  region            TEXT,
  source            TEXT,
  contact_name      TEXT,
  phone             TEXT,
  email             TEXT,
  kakao_id          TEXT,
  instagram_url     TEXT,
  naver_place_url   TEXT,
  website_url       TEXT,
  assigned_to       UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  status            company_status  NOT NULL DEFAULT '미연락',
  interest_level    SMALLINT        CHECK (interest_level BETWEEN 1 AND 5),
  expected_amount   BIGINT,
  contract_amount   BIGINT,
  meeting_at        TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  next_action_at    TIMESTAMPTZ,
  latest_note       TEXT,
  lost_reason       TEXT,
  created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activities (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID            NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID            NOT NULL REFERENCES profiles(id),
  activity_type   TEXT            NOT NULL,
  activity_result TEXT,
  memo            TEXT,
  next_action_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name TEXT        NOT NULL,
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_products (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  product_id UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, product_id)
);

CREATE TABLE IF NOT EXISTS notification_settings (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT        NOT NULL UNIQUE,
  value       TEXT        NOT NULL,
  description TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 회사(거래처)에 묶이지 않는 개인 KPI 활동 기록
-- entry_type: 'KOL 제안' | '스레드 업로드' (자유 입력 허용)
CREATE TABLE IF NOT EXISTS kpi_entries (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  entry_type TEXT        NOT NULL,
  topic      TEXT,
  entry_date DATE        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id                UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_type TEXT                NOT NULL,
  company_id        UUID                REFERENCES companies(id) ON DELETE SET NULL,
  user_id           UUID                REFERENCES profiles(id) ON DELETE SET NULL,
  slack_channel     TEXT,
  message           TEXT,
  status            notification_status NOT NULL DEFAULT 'pending',
  error_message     TEXT,
  sent_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);


-- ── 3. INDEXES ──────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_companies_assigned_to    ON companies(assigned_to);
CREATE INDEX IF NOT EXISTS idx_companies_status         ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_next_action_at ON companies(next_action_at);
CREATE INDEX IF NOT EXISTS idx_activities_company_id    ON activities(company_id);
CREATE INDEX IF NOT EXISTS idx_activities_user_id       ON activities(user_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at    ON activities(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_logs_company_id    ON notification_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_status        ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_type_created  ON notification_logs(notification_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kpi_entries_user_date    ON kpi_entries(user_id, entry_date);


-- ── 4. HELPER FUNCTIONS ─────────────────────────────────────
-- SECURITY DEFINER: RLS를 우회해 profiles를 직접 조회하므로
-- 무한 재귀 없이 역할을 확인할 수 있습니다.

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM profiles
  WHERE id = auth.uid() AND is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_admin_or_manager()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'manager')
      AND is_active = true
  );
$$;


-- ── 5. TRIGGERS ─────────────────────────────────────────────

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_notification_settings_updated_at
  BEFORE UPDATE ON notification_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- role / is_active 변경은 admin만 가능 (권한 상승 방지)
-- auth 컨텍스트가 없는 경우(service role, SQL Editor)는 허용
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active)
     AND COALESCE(get_my_role()::text, '') <> 'admin'
  THEN
    RAISE EXCEPTION 'role/is_active는 관리자만 변경할 수 있습니다.';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_protect_profile_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_fields();

-- activities INSERT → companies 자동 업데이트
-- last_contacted_at: 항상 최신 활동 시각으로 갱신
-- latest_note: 메모가 있을 때만 덮어씌움
-- next_action_at: 새 값이 있을 때만 덮어씌움
CREATE OR REPLACE FUNCTION sync_company_from_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE companies
  SET
    last_contacted_at = NEW.created_at,
    latest_note       = COALESCE(NEW.memo, latest_note),
    next_action_at    = COALESCE(NEW.next_action_at, next_action_at),
    updated_at        = NOW()
  WHERE id = NEW.company_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_activity_sync_company
  AFTER INSERT ON activities
  FOR EACH ROW EXECUTE FUNCTION sync_company_from_activity();

-- Supabase Auth 신규 가입 → profiles 자동 생성
-- 신규 가입자는 is_active = false로 생성되어 관리자 승인 전까지
-- 데이터에 접근할 수 없습니다. (설정 > 팀 관리에서 승인)
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO profiles (id, email, name, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ── 6. ROW LEVEL SECURITY ────────────────────────────────────

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE products              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_products      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs     ENABLE ROW LEVEL SECURITY;


-- ── 7. RLS POLICIES ──────────────────────────────────────────
-- 재실행 안전: 기존 정책을 먼저 삭제 후 재생성

-- ── profiles ──

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- role/is_active 변경 차단은 trg_protect_profile_fields 트리거가 담당
DROP POLICY IF EXISTS "profiles_update" ON profiles;
CREATE POLICY "profiles_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid() OR is_admin_or_manager())
  WITH CHECK (id = auth.uid() OR is_admin_or_manager());

DROP POLICY IF EXISTS "profiles_delete" ON profiles;
CREATE POLICY "profiles_delete"
  ON profiles FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

-- ── companies ──
-- admin/manager: 전체, sales: 본인 담당 거래처만

DROP POLICY IF EXISTS "companies_select" ON companies;
CREATE POLICY "companies_select"
  ON companies FOR SELECT
  TO authenticated
  USING (is_admin_or_manager() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "companies_insert" ON companies;
CREATE POLICY "companies_insert"
  ON companies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "companies_update" ON companies;
CREATE POLICY "companies_update"
  ON companies FOR UPDATE
  TO authenticated
  USING (is_admin_or_manager() OR assigned_to = auth.uid());

DROP POLICY IF EXISTS "companies_delete" ON companies;
CREATE POLICY "companies_delete"
  ON companies FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

-- ── activities ──

DROP POLICY IF EXISTS "activities_select" ON activities;
CREATE POLICY "activities_select"
  ON activities FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id
        AND (is_admin_or_manager() OR c.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "activities_insert" ON activities;
CREATE POLICY "activities_insert"
  ON activities FOR INSERT
  TO authenticated
  WITH CHECK (
    (user_id = auth.uid() OR is_admin_or_manager())
    AND EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id
        AND (is_admin_or_manager() OR c.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "activities_update" ON activities;
CREATE POLICY "activities_update"
  ON activities FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR get_my_role() = 'admin')
  WITH CHECK (user_id = auth.uid() OR get_my_role() = 'admin');

DROP POLICY IF EXISTS "activities_delete" ON activities;
CREATE POLICY "activities_delete"
  ON activities FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

-- ── products ──

DROP POLICY IF EXISTS "products_select" ON products;
CREATE POLICY "products_select"
  ON products FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "products_insert" ON products;
CREATE POLICY "products_insert"
  ON products FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_manager());

DROP POLICY IF EXISTS "products_update" ON products;
CREATE POLICY "products_update"
  ON products FOR UPDATE
  TO authenticated
  USING (is_admin_or_manager());

DROP POLICY IF EXISTS "products_delete" ON products;
CREATE POLICY "products_delete"
  ON products FOR DELETE
  TO authenticated
  USING (is_admin_or_manager());

-- ── company_products ──

DROP POLICY IF EXISTS "company_products_select" ON company_products;
CREATE POLICY "company_products_select"
  ON company_products FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id
        AND (is_admin_or_manager() OR c.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_products_insert" ON company_products;
CREATE POLICY "company_products_insert"
  ON company_products FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id
        AND (is_admin_or_manager() OR c.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "company_products_delete" ON company_products;
CREATE POLICY "company_products_delete"
  ON company_products FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = company_id
        AND (is_admin_or_manager() OR c.assigned_to = auth.uid())
    )
  );

-- ── kpi_entries ──
-- sales: 본인 기록만, admin/manager: 전체 열람

DROP POLICY IF EXISTS "kpi_entries_select" ON kpi_entries;
CREATE POLICY "kpi_entries_select"
  ON kpi_entries FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_admin_or_manager());

DROP POLICY IF EXISTS "kpi_entries_insert" ON kpi_entries;
CREATE POLICY "kpi_entries_insert"
  ON kpi_entries FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "kpi_entries_delete" ON kpi_entries;
CREATE POLICY "kpi_entries_delete"
  ON kpi_entries FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR get_my_role() = 'admin');

-- ── notification_settings ──

DROP POLICY IF EXISTS "notification_settings_select" ON notification_settings;
CREATE POLICY "notification_settings_select"
  ON notification_settings FOR SELECT
  TO authenticated
  USING (is_admin_or_manager());

DROP POLICY IF EXISTS "notification_settings_insert" ON notification_settings;
CREATE POLICY "notification_settings_insert"
  ON notification_settings FOR INSERT
  TO authenticated
  WITH CHECK (get_my_role() = 'admin');

DROP POLICY IF EXISTS "notification_settings_update" ON notification_settings;
CREATE POLICY "notification_settings_update"
  ON notification_settings FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin');

DROP POLICY IF EXISTS "notification_settings_delete" ON notification_settings;
CREATE POLICY "notification_settings_delete"
  ON notification_settings FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');

-- ── notification_logs ──

DROP POLICY IF EXISTS "notification_logs_select" ON notification_logs;
CREATE POLICY "notification_logs_select"
  ON notification_logs FOR SELECT
  TO authenticated
  USING (is_admin_or_manager());

DROP POLICY IF EXISTS "notification_logs_insert" ON notification_logs;
CREATE POLICY "notification_logs_insert"
  ON notification_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "notification_logs_delete" ON notification_logs;
CREATE POLICY "notification_logs_delete"
  ON notification_logs FOR DELETE
  TO authenticated
  USING (get_my_role() = 'admin');


-- ── 8. 기존 Auth 유저 profiles 동기화 ────────────────────────
-- 이미 가입된 유저가 있다면 아래 구문으로 profiles 레코드를 생성합니다.

INSERT INTO profiles (id, email, name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;
