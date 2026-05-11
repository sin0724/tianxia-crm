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
