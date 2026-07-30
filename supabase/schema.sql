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

-- status / category / source / activity_type / activity_result는 모두 TEXT 컬럼입니다.
-- status는 앱(constants.ts COMPANY_STATUS)에서 6단계로 검증합니다.
-- 과거 company_status ENUM은 아래 1-b에서 TEXT로 전환 후 9번 섹션에서 값을 재매핑합니다.

DO $$ BEGIN
  CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 1-b. ENUM → TEXT 마이그레이션 (기존 DB용, 재실행 안전) ──
-- 과거에 ENUM으로 생성된 컬럼을 TEXT로 전환합니다. 이미 TEXT면 무해합니다.

DO $$ BEGIN
  ALTER TABLE companies  ALTER COLUMN category        TYPE TEXT USING category::text;
  ALTER TABLE companies  ALTER COLUMN source          TYPE TEXT USING source::text;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- status: company_status ENUM → TEXT 전환 (기존 DB용, 재실행 안전)
-- ENUM default가 걸려 있으면 TYPE 변경이 막히므로 default를 먼저 떼고 변환한다.
DO $$ BEGIN
  ALTER TABLE companies ALTER COLUMN status DROP DEFAULT;
  ALTER TABLE companies ALTER COLUMN status TYPE TEXT USING status::text;
  ALTER TABLE companies ALTER COLUMN status SET DEFAULT '신규문의';
EXCEPTION WHEN undefined_table THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE activities ALTER COLUMN activity_type   TYPE TEXT USING activity_type::text;
  ALTER TABLE activities ALTER COLUMN activity_result TYPE TEXT USING activity_result::text;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- 유입일 컬럼 추가 (기존 DB용) + 기존 데이터는 등록일(KST)로 백필
ALTER TABLE companies ADD COLUMN IF NOT EXISTS inflow_date DATE DEFAULT ((NOW() AT TIME ZONE 'Asia/Seoul')::date);
UPDATE companies SET inflow_date = (created_at AT TIME ZONE 'Asia/Seoul')::date WHERE inflow_date IS NULL;
CREATE INDEX IF NOT EXISTS idx_companies_inflow_date ON companies(inflow_date);

-- 배정 시각 컬럼 추가 (기존 DB용) — "신규 배정 DB" 식별용.
-- 기존 데이터는 NULL로 두어(백필 안 함) 과거 배정 건이 '신규'로 표시되지 않게 한다.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_companies_assigned_at ON companies(assigned_at);

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
  -- 배정(분배) 시각 — "신규 배정 DB" 식별용. 분배/재배정 시 채워진다.
  assigned_at       TIMESTAMPTZ,
  status            TEXT            NOT NULL DEFAULT '신규문의',
  -- 유입일: "6월 DB / 7월 DB"처럼 신규 유입 시점을 추적 (KST 기준 오늘이 기본값)
  inflow_date       DATE            DEFAULT ((NOW() AT TIME ZONE 'Asia/Seoul')::date),
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

-- 앱 내(in-app) 알림 — 수신자별 읽음 상태를 가진 범용 알림.
-- 현재는 거래처 배분(type='assignment') 시 생성되어 대시보드 배너로 노출됩니다.
CREATE TABLE IF NOT EXISTS notifications (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,  -- 수신자
  type       TEXT        NOT NULL DEFAULT 'assignment',
  title      TEXT        NOT NULL,
  body       TEXT,
  link       TEXT,
  is_read    BOOLEAN     NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at    TIMESTAMPTZ
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
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);


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

-- KOL 관리 권한 — role과 별개로 admin이 특정 담당자에게만 켜 주는 플래그.
-- KOL 리스트 등록/수정/삭제, 엑셀 가져오기, 카테고리 관리에 쓰인다.
-- (기존 DB용, 재실행 안전)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_manage_kol BOOLEAN NOT NULL DEFAULT false;

-- admin은 항상 보유. 함수명을 컬럼명과 다르게 둬 참조 모호성을 피한다.
CREATE OR REPLACE FUNCTION is_kol_manager()
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND (p.role = 'admin' OR p.can_manage_kol)
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

-- role / is_active / can_manage_kol 변경은 admin만 가능 (권한 상승 방지)
-- auth 컨텍스트가 없는 경우(service role, SQL Editor)는 허용
CREATE OR REPLACE FUNCTION protect_profile_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND (NEW.role IS DISTINCT FROM OLD.role
          OR NEW.is_active IS DISTINCT FROM OLD.is_active
          OR NEW.can_manage_kol IS DISTINCT FROM OLD.can_manage_kol)
     AND COALESCE(get_my_role()::text, '') <> 'admin'
  THEN
    RAISE EXCEPTION 'role/is_active/can_manage_kol은 관리자만 변경할 수 있습니다.';
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
-- 주의: 이 트리거는 auth 서비스의 search_path(auth)에서 실행되므로
-- SET search_path와 스키마 명시(public.profiles)가 없으면 "relation not found"로
-- 실패해 "Database error creating new user" 오류가 난다.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, is_active)
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
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;


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

-- ── notifications ──
-- 수신자 본인만 열람/읽음처리. 삽입은 배분 주체(admin/manager) 또는 본인.

DROP POLICY IF EXISTS "notifications_select" ON notifications;
CREATE POLICY "notifications_select"
  ON notifications FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_insert" ON notifications;
CREATE POLICY "notifications_insert"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_manager() OR user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update" ON notifications;
CREATE POLICY "notifications_update"
  ON notifications FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete" ON notifications;
CREATE POLICY "notifications_delete"
  ON notifications FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() OR get_my_role() = 'admin');


-- ── 8. 기존 Auth 유저 profiles 동기화 ────────────────────────
-- 이미 가입된 유저가 있다면 아래 구문으로 profiles 레코드를 생성합니다.

INSERT INTO profiles (id, email, name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'name', split_part(email, '@', 1))
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ── 9. 카테고리 간소화 마이그레이션 (2026-06 담당자 건의 반영) ──
-- 기존 13개 상태 / 자유입력 구분 / DB경로를 간소화된 분류 체계로 재매핑한다.
-- 모두 idempotent: 이미 새 값이면 WHERE에 걸리지 않아 재실행해도 안전하다.
-- (status가 TEXT로 전환된 뒤 실행되어야 하므로 1-b 변환 이후 시점인 이 위치에 둔다.)

-- 9-a. DB 상태: 13단계 → 6단계
--   미연락·1차 연락 완료·부재·답변 대기 → 신규문의 (아직 제안/미팅 전)
--   관심 있음 → 제안서발송 (반응 있는 '가망'은 신규문의로 희석하지 않고 한 단계 위로)
--   미팅 예정·미팅 완료 → 미팅진행 / 제안서 발송 → 제안서발송 / 계약 검토 → 계약검토
--   계약 완료 → 계약완료 / 보류·실패·제외 → 이탈/보류
UPDATE companies SET status = CASE status
  WHEN '미연락'        THEN '신규문의'
  WHEN '1차 연락 완료' THEN '신규문의'
  WHEN '부재'          THEN '신규문의'
  WHEN '답변 대기'     THEN '신규문의'
  WHEN '관심 있음'     THEN '제안서발송'
  WHEN '미팅 예정'     THEN '미팅진행'
  WHEN '미팅 완료'     THEN '미팅진행'
  WHEN '제안서 발송'   THEN '제안서발송'
  WHEN '계약 검토'     THEN '계약검토'
  WHEN '계약 완료'     THEN '계약완료'
  WHEN '보류'          THEN '이탈/보류'
  WHEN '실패'          THEN '이탈/보류'
  WHEN '제외'          THEN '이탈/보류'
  ELSE status
END
WHERE status IN (
  '미연락','1차 연락 완료','부재','답변 대기','관심 있음',
  '미팅 예정','미팅 완료','제안서 발송','계약 검토','계약 완료','보류','실패','제외'
);

-- 9-b. 업종(구분): 알려진 값만 새 분류로, 나머지(학원·피트니스·자유입력·빈값)는 미분류
UPDATE companies SET category = CASE category
  WHEN '맛집'        THEN 'F&B'
  WHEN '카페/디저트' THEN 'F&B'
  WHEN '뷰티샵'      THEN '뷰티'
  WHEN '기타'        THEN '기타및대행사'
  ELSE category
END
WHERE category IN ('맛집','카페/디저트','뷰티샵','기타');

UPDATE companies SET category = '미분류'
WHERE category IS NULL
   OR category NOT IN ('병의원','F&B','뷰티','코스메틱','커머스','숙박','기타및대행사','미분류');

-- 9-c. DB 경로: 7개로 간소화 (스레드·회사DB는 그대로 유지)
UPDATE companies SET source = CASE source
  WHEN 'OB'        THEN '아웃바운드'
  WHEN '네이버'    THEN '네이버블로그/폼'
  WHEN '인스타그램' THEN '인스타DM'
  WHEN '메타 광고'  THEN '메타광고'
  WHEN '소개'      THEN '기타및소개'
  WHEN '기존 고객'  THEN '기타및소개'
  WHEN '기타'      THEN '기타및소개'
  ELSE source
END
WHERE source IN ('OB','네이버','인스타그램','메타 광고','소개','기존 고객','기타');

-- 9-d. 더 이상 쓰지 않는 company_status ENUM 정리 (참조 중이면 그대로 둠)
DO $$ BEGIN DROP TYPE IF EXISTS company_status; EXCEPTION WHEN dependent_objects_still_exist THEN NULL; END $$;


-- ── 10. KOL 아카이브 ─────────────────────────────────────────
-- 인플루언서(KOL) 리스트 — 전직원 열람, 등록/수정/삭제는 KOL 관리 권한 보유자만
-- (admin 또는 profiles.can_manage_kol이 켜진 담당자 → is_kol_manager()).
-- 히스토리(진행 이력·협업 브랜드)는 자유 텍스트로 두고 ilike 검색으로 커버한다.

CREATE TABLE IF NOT EXISTS kols (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  instagram_handle TEXT        UNIQUE,   -- '@' 없이 소문자로 정규화 저장 (중복 등록 방지)
  email            TEXT,                 -- 연락용 이메일 (선택)
  followers        INTEGER,
  categories       TEXT[]      NOT NULL DEFAULT '{}',
  rate             TEXT,                 -- 진행 단가 (자유 입력: "피드 50 / 릴스 80")
  visit_note       TEXT,                 -- 방문 예정 표시용: "7/12~7/15 방문", "7월중 예정"
  visit_date       DATE,                 -- 방문 예정 시작일 (메모에서 자동 해석 or 직접 입력)
  visit_end_date   DATE,                 -- 방문 예정 종료일 ("7월중"→7/31) — 필터·지남 판정용
  history          TEXT,                 -- 진행 이력·협업 브랜드 (자유 텍스트, 검색 대상)
  created_by       UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 이메일 컬럼 추가 (기존 DB용, 재실행 안전)
ALTER TABLE kols ADD COLUMN IF NOT EXISTS email TEXT;

-- 방문 종료일 컬럼 추가 (기존 DB용, 재실행 안전)
-- "7월중 방문"처럼 기간 표기 메모를 날짜 범위로 해석해 저장 — 기존 행은
-- 일일 크론(daily-sales-reminder)이 자동 백필하고, 지난 방문은 자동 정리한다.
ALTER TABLE kols ADD COLUMN IF NOT EXISTS visit_end_date DATE;

CREATE INDEX IF NOT EXISTS idx_kols_followers  ON kols(followers);
CREATE INDEX IF NOT EXISTS idx_kols_visit_date ON kols(visit_date);
CREATE INDEX IF NOT EXISTS idx_kols_categories ON kols USING GIN (categories);

CREATE OR REPLACE TRIGGER trg_kols_updated_at
  BEFORE UPDATE ON kols
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE kols ENABLE ROW LEVEL SECURITY;

-- 열람: 승인된(is_active) 전직원. get_my_role()은 미승인 유저에게 NULL을 반환한다.
DROP POLICY IF EXISTS "kols_select" ON kols;
CREATE POLICY "kols_select"
  ON kols FOR SELECT
  TO authenticated
  USING (get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "kols_insert" ON kols;
CREATE POLICY "kols_insert"
  ON kols FOR INSERT
  TO authenticated
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kols_update" ON kols;
CREATE POLICY "kols_update"
  ON kols FOR UPDATE
  TO authenticated
  USING (is_kol_manager())
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kols_delete" ON kols;
CREATE POLICY "kols_delete"
  ON kols FOR DELETE
  TO authenticated
  USING (is_kol_manager());


-- ── 11. KOL 카테고리 관리 ────────────────────────────────────
-- 카테고리를 하드코딩 대신 테이블로 관리 — 관리자가 설정 없이
-- 추가/이름 변경/삭제/순서 변경 가능. kols.categories에는 이름이
-- 그대로 저장되므로, 이름 변경/삭제 시 앱에서 kols 배열도 함께 갱신한다.

CREATE TABLE IF NOT EXISTS kol_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL UNIQUE,
  color      TEXT        NOT NULL DEFAULT 'bg-gray-100 text-gray-600',  -- Tailwind 클래스 (팔레트에서 선택)
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE kol_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kol_categories_select" ON kol_categories;
CREATE POLICY "kol_categories_select"
  ON kol_categories FOR SELECT
  TO authenticated
  USING (get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "kol_categories_insert" ON kol_categories;
CREATE POLICY "kol_categories_insert"
  ON kol_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kol_categories_update" ON kol_categories;
CREATE POLICY "kol_categories_update"
  ON kol_categories FOR UPDATE
  TO authenticated
  USING (is_kol_manager())
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kol_categories_delete" ON kol_categories;
CREATE POLICY "kol_categories_delete"
  ON kol_categories FOR DELETE
  TO authenticated
  USING (is_kol_manager());

-- ── 12. 메타 리드 동기화 (2026-07) ────────────────────────────
-- 메타 인스턴트 폼 리드를 크론(/api/cron/sync-meta-leads)으로 가져올 때
-- 같은 리드가 두 번 등록되지 않도록 리드 ID를 저장한다. (재실행 안전)

ALTER TABLE companies ADD COLUMN IF NOT EXISTS meta_lead_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_meta_lead_id
  ON companies(meta_lead_id) WHERE meta_lead_id IS NOT NULL;

-- ── 13. 삭제된 메타 리드 재등록 방지 (2026-07) ─────────────────
-- 메타는 리드를 90일간 계속 내려주는데, 거래처를 지우면 meta_lead_id
-- 기록도 함께 사라져 다음 크론 때 같은 리드가 '신규'로 다시 등록된다.
-- 삭제 시 트리거로 리드 ID를 남겨 두고, 크론이 이 목록을 건너뛴다.

CREATE TABLE IF NOT EXISTS deleted_meta_leads (
  meta_lead_id TEXT PRIMARY KEY,
  company_name TEXT,
  deleted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 정책 없이 RLS만 켠다: service role(크론)과 아래 SECURITY DEFINER
-- 트리거만 접근하면 되므로 일반 사용자 경로는 모두 차단.
ALTER TABLE deleted_meta_leads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION remember_deleted_meta_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.meta_lead_id IS NOT NULL THEN
    INSERT INTO deleted_meta_leads (meta_lead_id, company_name)
    VALUES (OLD.meta_lead_id, OLD.company_name)
    ON CONFLICT (meta_lead_id) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

CREATE OR REPLACE TRIGGER trg_remember_deleted_meta_lead
  AFTER DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION remember_deleted_meta_lead();


-- ── 14. KOL 진행 조건 · 공구매출 이력 (2026-07) ────────────────
-- 자유 텍스트 rate("13,300 NTD / 릴스 1개, 스토리 5개 이상, 바이오링크 3일")는
-- 금액·통화·제공 항목이 한 문장에 섞여 정렬·필터·예산 계산이 불가능하다.
-- 셋으로 분리하고, rate는 원문 보존용으로 남긴다 (파싱 검증용이며
-- gonggu-admin이 읽는 컬럼이므로 이름 변경·삭제·타입 변경 금지).
-- 신규 입력은 아래 컬럼만 사용한다.

-- 14-a. 고정비 · RS 요율 · 제공 항목 · 공구 카테고리 (모두 컬럼 "추가"만)

ALTER TABLE kols ADD COLUMN IF NOT EXISTS fee_amount        NUMERIC;
ALTER TABLE kols ADD COLUMN IF NOT EXISTS fee_currency      TEXT NOT NULL DEFAULT 'TWD';
ALTER TABLE kols ADD COLUMN IF NOT EXISTS deliverables      TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE kols ADD COLUMN IF NOT EXISTS rs_rate           NUMERIC;
ALTER TABLE kols ADD COLUMN IF NOT EXISTS gonggu_categories TEXT[] NOT NULL DEFAULT '{}';
-- rate 원문 파싱이 실패했거나 애매한 건 — 목록에 "원문 확인 필요" 배지를 띄운다.
-- 담당자가 진행 조건을 저장하면 앱에서 FALSE로 내린다.
ALTER TABLE kols ADD COLUMN IF NOT EXISTS rate_needs_review BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN kols.rate              IS '[레거시] 진행 단가 원문 — 보존용. 신규 입력은 fee_amount/fee_currency/deliverables 사용';
COMMENT ON COLUMN kols.fee_amount        IS '고정비 금액 — 판매량과 무관하게 지급하는 정액';
COMMENT ON COLUMN kols.fee_currency      IS '고정비 통화: TWD(대만달러, 기본) | KRW(원)';
COMMENT ON COLUMN kols.deliverables      IS '제공 항목: {"릴스 1개","스토리 5개 이상","바이오링크 3일"}';
COMMENT ON COLUMN kols.rs_rate           IS 'RS 요율(%) — 판매액 대비 KOL 몫. 0~100. 고정비와 독립(하나만 채워도 정상)';
COMMENT ON COLUMN kols.categories        IS 'KOL 콘텐츠 장르 (kol_categories 마스터 기준)';
COMMENT ON COLUMN kols.gonggu_categories IS '이 KOL로 돌릴 수 있는 공구 품목 — gonggu-admin GONGGU_CATEGORIES와 동일 목록';

ALTER TABLE kols DROP CONSTRAINT IF EXISTS kols_fee_currency_check;
ALTER TABLE kols ADD  CONSTRAINT kols_fee_currency_check
  CHECK (fee_currency IN ('TWD','KRW'));

ALTER TABLE kols DROP CONSTRAINT IF EXISTS kols_fee_amount_check;
ALTER TABLE kols ADD  CONSTRAINT kols_fee_amount_check
  CHECK (fee_amount IS NULL OR fee_amount >= 0);

ALTER TABLE kols DROP CONSTRAINT IF EXISTS kols_rs_rate_check;
ALTER TABLE kols ADD  CONSTRAINT kols_rs_rate_check
  CHECK (rs_rate IS NULL OR (rs_rate >= 0 AND rs_rate <= 100));

CREATE INDEX IF NOT EXISTS idx_kols_fee_amount        ON kols(fee_amount);
CREATE INDEX IF NOT EXISTS idx_kols_deliverables      ON kols USING GIN (deliverables);
CREATE INDEX IF NOT EXISTS idx_kols_gonggu_categories ON kols USING GIN (gonggu_categories);


-- 14-b. 통화 환산 기준 환율
-- 통화가 섞인 값을 "비교"할 때만 쓴다 (고정비 금액순 정렬·범위 필터, 누적 공구매출 정렬).
-- 표시는 항상 원문 통화 그대로. 값을 바꿀 때 src/lib/constants.ts의 TWD_TO_KRW도
-- 같은 값으로 수정해야 화면에 명시되는 환율과 정렬 기준이 어긋나지 않는다.

CREATE OR REPLACE FUNCTION twd_to_krw_rate()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE PARALLEL SAFE
AS $$ SELECT 44::NUMERIC $$;


-- 14-c. 공구매출 이력
-- 이 KOL이 이전에 진행한 공동구매의 판매 실적. 우리 시스템 밖에서 진행한 건
-- (다른 회사 공구 등)도 기입할 수 있다. 한 KOL이 여러 번 진행하므로 단일 숫자가
-- 아니라 이력으로 관리한다 — "언제 · 무엇을 · 얼마"가 있어야 섭외 판단이 된다.
-- 용어는 "공구매출"로 고정 (gonggu-admin의 캠페인 실적과 혼동 방지).

CREATE TABLE IF NOT EXISTS kol_gonggu_sales (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kol_id     UUID        NOT NULL REFERENCES kols(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,               -- 공구명
  brand      TEXT,                               -- 진행 브랜드/업체
  sale_date  DATE,                               -- 진행일
  amount     NUMERIC     NOT NULL DEFAULT 0,     -- 공구매출 금액
  currency   TEXT        NOT NULL DEFAULT 'TWD', -- 'TWD' | 'KRW' (대만 공구는 NTD로 기입)
  quantity   INTEGER,                            -- 판매 수량
  notes      TEXT,                               -- 반응, 재구매율 등
  created_by UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  kol_gonggu_sales        IS 'KOL 공구매출 이력 (외부 진행 건 포함)';
COMMENT ON COLUMN kol_gonggu_sales.amount IS '공구매출 금액 — currency 기준';

ALTER TABLE kol_gonggu_sales DROP CONSTRAINT IF EXISTS kol_gonggu_sales_currency_check;
ALTER TABLE kol_gonggu_sales ADD  CONSTRAINT kol_gonggu_sales_currency_check
  CHECK (currency IN ('TWD','KRW'));

ALTER TABLE kol_gonggu_sales DROP CONSTRAINT IF EXISTS kol_gonggu_sales_amount_check;
ALTER TABLE kol_gonggu_sales ADD  CONSTRAINT kol_gonggu_sales_amount_check
  CHECK (amount >= 0);

ALTER TABLE kol_gonggu_sales DROP CONSTRAINT IF EXISTS kol_gonggu_sales_quantity_check;
ALTER TABLE kol_gonggu_sales ADD  CONSTRAINT kol_gonggu_sales_quantity_check
  CHECK (quantity IS NULL OR quantity >= 0);

CREATE INDEX IF NOT EXISTS idx_kol_gonggu_sales_kol_id ON kol_gonggu_sales(kol_id);
CREATE INDEX IF NOT EXISTS idx_kol_gonggu_sales_date   ON kol_gonggu_sales(sale_date);

ALTER TABLE kol_gonggu_sales ENABLE ROW LEVEL SECURITY;

-- kols와 동일한 정책: 열람은 전직원, 쓰기는 KOL 관리 권한자만
DROP POLICY IF EXISTS "kol_gonggu_sales_select" ON kol_gonggu_sales;
CREATE POLICY "kol_gonggu_sales_select"
  ON kol_gonggu_sales FOR SELECT
  TO authenticated
  USING (get_my_role() IS NOT NULL);

DROP POLICY IF EXISTS "kol_gonggu_sales_insert" ON kol_gonggu_sales;
CREATE POLICY "kol_gonggu_sales_insert"
  ON kol_gonggu_sales FOR INSERT
  TO authenticated
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kol_gonggu_sales_update" ON kol_gonggu_sales;
CREATE POLICY "kol_gonggu_sales_update"
  ON kol_gonggu_sales FOR UPDATE
  TO authenticated
  USING (is_kol_manager())
  WITH CHECK (is_kol_manager());

DROP POLICY IF EXISTS "kol_gonggu_sales_delete" ON kol_gonggu_sales;
CREATE POLICY "kol_gonggu_sales_delete"
  ON kol_gonggu_sales FOR DELETE
  TO authenticated
  USING (is_kol_manager());


-- 14-d. 목록 조회용 뷰 — 누적 공구매출 합계 + 비교용 환산액
-- 정렬(고정비순·누적 공구매출순)과 제공 항목 부분 검색은 집계·문자열이 필요해
-- 뷰에서 계산한다. 누적액은 통화별로 나눠 담고(gonggu_sales_twd/krw), 정렬용
-- 환산 합계(_krw_total)는 twd_to_krw_rate() 기준 — 화면에 환율을 명시한다.
-- 쓰기는 항상 kols / kol_gonggu_sales 테이블에 직접 한다.
-- security_invoker: 뷰 조회자의 RLS를 그대로 적용 (PostgreSQL 15+)

DROP VIEW IF EXISTS kols_with_gonggu;
CREATE VIEW kols_with_gonggu WITH (security_invoker = on) AS
SELECT
  k.*,
  -- 제공 항목 부분 검색용("릴스"로 찾기) — 배열은 ilike가 안 되므로 문자열로 펼침
  array_to_string(k.deliverables, ' | ')                                     AS deliverables_text,
  CASE k.fee_currency WHEN 'TWD' THEN k.fee_amount * twd_to_krw_rate()
                                 ELSE k.fee_amount END                       AS fee_amount_krw,
  COALESCE(s.total_twd, 0)                                                   AS gonggu_sales_twd,
  COALESCE(s.total_krw, 0)                                                   AS gonggu_sales_krw,
  COALESCE(s.total_krw, 0) + COALESCE(s.total_twd, 0) * twd_to_krw_rate()    AS gonggu_sales_krw_total,
  COALESCE(s.sale_count, 0)                                                  AS gonggu_sales_count,
  s.last_sale_date                                                           AS gonggu_sales_last_date
FROM kols k
LEFT JOIN (
  SELECT
    kol_id,
    SUM(CASE WHEN currency = 'TWD' THEN amount ELSE 0 END) AS total_twd,
    SUM(CASE WHEN currency = 'KRW' THEN amount ELSE 0 END) AS total_krw,
    COUNT(*)                                              AS sale_count,
    MAX(sale_date)                                        AS last_sale_date
  FROM kol_gonggu_sales
  GROUP BY kol_id
) s ON s.kol_id = k.id;

GRANT SELECT ON kols_with_gonggu TO authenticated, service_role;


-- 14-e. rate 원문 → fee_amount / fee_currency / deliverables 1회 백필
-- 자유 텍스트라 100% 파싱은 불가능하므로, 애매한 건은 rate_needs_review로 표시해
-- 사람이 정리하게 한다. 이미 한 번 실행됐으면(파싱 결과가 하나라도 있으면) 건너뛴다.
--   · 금액: 첫 숫자 토큰에서 콤마 제거 (13,300 → 13300)
--   · 통화: NTD/NT$/TWD/元 → TWD, KRW/₩/원 → KRW, 없으면 TWD(기본) + 확인 필요
--   · 제공 항목: "/" 뒤를 쉼표로 분리해 각각 배열 원소로

DO $$
DECLARE
  touched INTEGER;
BEGIN
  IF EXISTS (SELECT 1 FROM kols WHERE fee_amount IS NOT NULL OR rate_needs_review) THEN
    RAISE NOTICE 'kols.rate 백필 건너뜀 — 이미 실행된 흔적이 있습니다.';
    RETURN;
  END IF;

  WITH src AS (
    -- "/" 앞이 금액부, 뒤가 제공 항목부
    SELECT id, rate,
           CASE WHEN position('/' IN rate) > 0
                THEN left(rate, position('/' IN rate) - 1)
                ELSE rate END AS head
      FROM kols
     WHERE rate IS NOT NULL AND btrim(rate) <> ''
  ), parsed AS (
    SELECT
      id, rate,
      -- 금액부의 첫 숫자 토큰 (소수점 이하 무시) × 만/천 단위 배수
      NULLIF(replace(COALESCE(substring(head FROM '[0-9][0-9,]*'), ''), ',', ''), '')::NUMERIC
        * CASE WHEN head ~ '[0-9][0-9,]*\s*만' THEN 10000
               WHEN head ~ '[0-9][0-9,]*\s*천' THEN 1000
               ELSE 1 END                                                AS amount,
      CASE
        WHEN rate ~* '(NTD|NT\$|TWD|元)' THEN 'TWD'
        WHEN rate ~* '(KRW|₩)'           THEN 'KRW'
        WHEN rate ~  '[0-9]\s*만?\s*원'  THEN 'KRW'
        ELSE 'TWD'
      END                                                                AS currency,
      (rate ~* '(NTD|NT\$|TWD|元|KRW|₩)' OR rate ~ '[0-9]\s*만?\s*원')   AS has_currency,
      CASE WHEN position('/' IN rate) > 0 THEN COALESCE((
        SELECT array_agg(btrim(t) ORDER BY ord)
        FROM unnest(string_to_array(substring(rate FROM position('/' IN rate) + 1), ','))
             WITH ORDINALITY AS u(t, ord)
        WHERE btrim(t) <> ''
      ), '{}'::TEXT[]) ELSE '{}'::TEXT[] END                             AS items
      FROM src
  )
  UPDATE kols k SET
    fee_amount        = p.amount,
    fee_currency      = p.currency,
    deliverables      = p.items,
    -- 금액을 못 읽었거나 / 통화 표기가 없거나 / 금액이 비정상적으로 작으면
    -- ("피드 50"처럼 단위가 생략된 표기) 사람이 원문을 확인해야 한다
    rate_needs_review = (p.amount IS NULL OR NOT p.has_currency OR p.amount < 1000)
  FROM parsed p
  WHERE k.id = p.id;

  GET DIAGNOSTICS touched = ROW_COUNT;
  RAISE NOTICE 'kols.rate 백필 완료 — %건 처리', touched;
END $$;


-- 기존 하드코딩 카테고리 시드 (이미 있으면 건너뜀)
INSERT INTO kol_categories (name, color, sort_order) VALUES
  ('뷰티',         'bg-pink-100 text-pink-700',     1),
  ('의료/시술',    'bg-red-100 text-red-700',       2),
  ('맛집/F&B',     'bg-orange-100 text-orange-700', 3),
  ('패션',         'bg-purple-100 text-purple-700', 4),
  ('여행/숙박',    'bg-sky-100 text-sky-700',       5),
  ('리빙',         'bg-teal-100 text-teal-700',     6),
  ('육아/키즈',    'bg-yellow-100 text-yellow-800', 7),
  ('운동/헬스',    'bg-green-100 text-green-700',   8),
  ('라이프스타일', 'bg-indigo-100 text-indigo-700', 9),
  ('기타',         'bg-gray-100 text-gray-600',     10)
ON CONFLICT (name) DO NOTHING;
