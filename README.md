This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 프로젝트 현황 (`/projects`)

로그인한 직원이 재무 시스템의 프로젝트 현황을 보는 화면입니다. 항목은 카테고리, 상품명, 계약 수량만 보여 주고 진행·잔여와 진행 막대는 쓰지 않습니다. 요약 카드는 진행중 프로젝트 수, 계약금액 합계, 입금액 합계, 계약 건수 합계입니다. 담당자는 재무 피드에 없고, 고객사명을 CRM 거래처명 또는 아래 재무 별칭과 맞춰(앞뒤·사이 공백, `(주)`, `주식회사` 제거, 대소문자 무시) 그 거래처의 담당자 이름을 씁니다. 맞지 않거나 담당자가 없으면 미매칭이며 필터할 수 있습니다. 서버가 `GET ${FINANCE_API_URL}/api/integrations/staff-progress` 를 `Authorization: Bearer <FINANCE_STAFF_PROGRESS_SECRET>` 으로 호출합니다. `status` 쿼리는 생략하고 전체를 받은 뒤 화면에서 거릅니다. 본문은 `{ projects: [...] }` 이고, 각 행은 `client`, `project`, `status`, `contract_date`, `contract_amount`, `paid_amount`, `items`, `totals` 만 있습니다. `items` 는 `{ category, product_name, contracted }`, `totals` 는 `{ contracted }` 입니다. 두 환경변수는 서버에만 있고 브라우저로 내려가지 않습니다. 응답은 약 60초 캐시됩니다. 값이 없거나 재무 API가 실패하면 화면은 안내 문구만 보여 줍니다. 각 프로젝트에 `payments: [{ paid_at, amount }]` 가 있으면 입금일(한국 시간)로 월별 입금매출을 만들고, 없으면 그 프로젝트의 월별 입금은 0입니다. 계약매출은 `contract_amount` 를 `contract_date` 의 월에 넣습니다. 화면에서 기준 월(기본값은 이번 달)과 계약매출/입금매출을 고릅니다.

## 재무 고객명 별칭 (`POST /api/integrations/project-assignee`)

재무 고객명이 CRM 거래처명과 맞지 않을 때, 그 이름을 기존 거래처의 별칭으로 저장한다. 스키마 마이그레이션은 없다. `activities` 에 `activity_type` `finance_alias`, `memo` 는 정규화된 고객명(앞뒤·사이 공백, `(주)`, `주식회사` 제거, 소문자)으로 한 줄을 넣는다. 같은 이름의 가장 최근 별칭을 담당자 매칭에 쓴다. 거래처명으로 담당자가 이미 정해지면 별칭은 쓰지 않는다. 활동 목록에는 이 행을 보여 주지 않고, 저장 직후 `latest_note` 와 `last_contacted_at` 을 원래 값으로 되돌린다.

```
Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
Content-Type: application/json
```

`{ "client_name": "재무 고객명", "company_id": "거래처 uuid" }`

`company_id` 를 생략하면 정규화한 이름이 거래처 하나와만 같을 때 그 거래처에 연결한다. 없거나 여러 개면 400이다. 미매칭 고객 목록을 돌려주는 GET 은 없다. 그 이름은 재무 피드에만 있다.

```bash
node --test scripts/project-assignee.test.mjs
```

```bash
node --test scripts/staff-progress.test.mjs
```

## 연동 API — 슬랙 리드 (`POST /api/integrations/lead`)

Slack 워크플로우에서 올린 신규 문의를 거래처로 넣는다. 미팅 연동(`POST /api/integrations/meeting`)과 같이 Bearer 토큰으로 인증한다.

```
Authorization: Bearer <INTEGRATION_SECRET 또는 CRON_SECRET>
Content-Type: application/json
```

`INTEGRATION_SECRET`과 `CRON_SECRET` 중 설정된 값이면 통과한다. 둘 다 비어 있으면 401이다. 서비스 롤 키(`SUPABASE_SERVICE_ROLE_KEY`)는 서버에서만 쓰고, 코드나 이 문서에 값을 적지 않는다.

### 본문

| 필드 | 설명 |
| --- | --- |
| `company_name` | 필수. 상호명 |
| `phone` | 숫자만 저장한다. `010-1234-5678` → `01012345678`. 값에 이메일이 있으면 그 주소는 `email`에 소문자로 저장하고, 이메일을 뺀 나머지 숫자만 전화번호로 본다 |
| `contact_name` | 고객 담당자 |
| `source` | `src/lib/constants.ts`의 `COMPANY_SOURCE`. 없거나 목록에 없으면 신규 생성 시 `기타및소개`. 병합 때는 요청에 값이 있고 기존 칸이 비어 있을 때만 채운다 |
| `category` | `COMPANY_CATEGORY`. 없거나 목록에 없으면 신규 생성 시 `미분류`. 병합 규칙은 source와 같다 |
| `special_note` | 신규 거래처의 `latest_note`. 병합 때는 비어 있을 때만 채운다 |
| `interest_level` | 1–5 정수. 생략하면 null. 범위 밖이면 400 |
| `poster_name` / `poster_email` | 활성 프로필과 대조해 `assigned_to`를 정한다. 이메일을 먼저 보고, 없으면 이름. 못 찾으면 null. 기존 거래처의 담당자·상태는 바꾸지 않는다 |
| `poster_slack_id` | 배정에는 쓰지 않는다. 프로필을 못 찾은 경우에만 활동 메모의 `슬랙 작성자` 줄에 남긴다 |
| `slack_permalink` | 활동 메모에 붙인다 |
| `raw_text` | `special_note`와 다를 때만 활동 메모에 붙인다 |
| `dedupe_key` | Slack 메시지 ts. 같은 키를 다시 보내면 처음의 `{ id, result, url }`을 그대로 돌려주고 알림을 다시 보내지 않는다 |

### 중복

전화번호(숫자만, 8자리 이상) → 소문자 이메일 → 상호명 완전 일치 순서로 기존 거래처를 찾는다. `010-1234-5678`과 `01012345678`은 같은 번호다. 여럿이면 `updated_at`이 최신인 행을 쓴다.

맞으면 비어 있는 칸만 채운다. `status`와 `assigned_to`는 비어 있어도 덮어쓰지 않는다. 활동 한 줄을 추가하고 `{ id, result: "merged", url }`을 반환한다.

없으면 `status`는 `신규문의`, `inflow_date`는 오늘(Asia/Seoul), `latest_note`는 `special_note`로 만들고 활동 한 줄을 추가한다. `{ id, result: "created", url }`을 반환한다. `url`은 `NEXT_PUBLIC_APP_URL`(끝 슬래시 제거, 없으면 `http://localhost:3000`) + `/companies/<id>`이다.

활동 메모는 `special_note`, 슬랙 링크, 그리고 멱등 표식 `[[lead-dedupe:<encodeURIComponent(dedupe_key)>]] result:created|merged` 순이다. 스키마 마이그레이션 없이 이 표식으로 재전송을 가른다. 활동의 `user_id`는 매칭된 프로필이다. 프로필이 없으면 활성 관리자(없으면 매니저, 없으면 아무 활성 사용자)에게 남기고, 원래 작성자는 메모에 적는다.

### 신규 DB 알림

새로 만든 경우에만 기존 신규 등록과 같은 슬랙 알림을 보낸다. 헤더는 `🆕 신규 DB 등록`, 본문에는 상호명 링크·구분·DB 경로·담당자·상태가 있다. `SLACK_WEBHOOK_URL`이 없으면 등록은 성공하고 알림만 실패로 기록한다. 병합과 멱등 재전송은 알림을 보내지 않는다.

```bash
node --test scripts/lead-integration.test.mjs
```


## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
