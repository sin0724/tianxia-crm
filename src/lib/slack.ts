export interface SlackHeaderBlock {
  type: 'header'
  text: { type: 'plain_text'; text: string }
}

export interface SlackSectionBlock {
  type: 'section'
  text: { type: 'mrkdwn'; text: string }
}

export interface SlackDividerBlock {
  type: 'divider'
}

export type SlackBlock = SlackHeaderBlock | SlackSectionBlock | SlackDividerBlock

export interface SlackPayload {
  text: string
  blocks?: SlackBlock[]
}

export interface SlackResult {
  ok: true
}

export interface SlackError {
  ok: false
  error: string
}

export async function sendSlackNotification(
  payload: SlackPayload,
): Promise<SlackResult | SlackError> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL
  if (!webhookUrl) {
    return { ok: false, error: 'SLACK_WEBHOOK_URL not configured' }
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const body = await res.text()
      return { ok: false, error: `HTTP ${res.status}: ${body}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

/**
 * 개인 DM 발송 (SLACK_BOT_TOKEN + chat.postMessage).
 * 봇 토큰이 없거나 slackUserId가 없으면 공용 webhook 채널로 폴백합니다.
 * 봇 앱에는 chat:write / im:write 스코프가 필요합니다.
 */
export async function sendSlackDM(
  slackUserId: string | null,
  payload: SlackPayload,
): Promise<SlackResult | SlackError> {
  const botToken = process.env.SLACK_BOT_TOKEN

  if (!botToken || !slackUserId) {
    return sendSlackNotification(payload)
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${botToken}`,
      },
      body: JSON.stringify({
        channel: slackUserId, // user ID로 보내면 봇 DM으로 전송됨
        text: payload.text,
        blocks: payload.blocks,
      }),
    })

    const body = (await res.json()) as { ok: boolean; error?: string }
    if (!body.ok) {
      // DM 실패 시 채널 webhook으로 폴백
      const fallback = await sendSlackNotification(payload)
      if (fallback.ok) return fallback
      return { ok: false, error: `DM failed: ${body.error ?? 'unknown'}; webhook failed: ${fallback.error}` }
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}
