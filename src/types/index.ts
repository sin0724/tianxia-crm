// 공유 타입 — 도메인 타입은 각 lib 파일에서 정의합니다.
// Profile, UserRole → @/lib/auth

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
}
