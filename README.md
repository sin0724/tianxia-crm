This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## 프로젝트 현황 (`/projects`)

로그인한 직원이 재무 시스템의 프로젝트 현황을 보는 화면입니다. 항목은 카테고리, 상품명, 계약 수량만 보여 주고 진행·잔여와 진행 막대는 쓰지 않습니다. 요약 카드는 진행중 프로젝트 수, 계약금액 합계, 입금액 합계, 계약 건수 합계입니다. 서버가 `GET ${FINANCE_API_URL}/api/integrations/staff-progress` 를 `Authorization: Bearer <FINANCE_STAFF_PROGRESS_SECRET>` 으로 호출합니다. 두 값은 서버 환경변수이고 브라우저로 내려가지 않습니다. 응답은 약 60초 캐시됩니다. 값이 없거나 재무 API가 실패하면 화면은 안내 문구만 보여 줍니다.

```bash
node --test scripts/staff-progress.test.mjs
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
