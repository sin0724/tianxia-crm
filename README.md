This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

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
