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
