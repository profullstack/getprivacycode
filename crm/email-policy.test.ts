import { describe, expect, test } from 'bun:test'
import { assertEmailSenderAllowed } from './email-policy'

describe('CRM blocked sender policy', () => {
  test('blocks configured From and SMTP account addresses but leaves other mailboxes alone', () => {
    const previous = process.env.EMAIL_QUEUE_BLOCKED_SENDERS
    process.env.EMAIL_QUEUE_BLOCKED_SENDERS = 'ettinger@gmail.com'
    try {
      expect(() => assertEmailSenderAllowed('owner@example.com', 'ettinger@gmail.com')).toThrow(/paused/)
      expect(() => assertEmailSenderAllowed('ETTINGER@gmail.com')).toThrow(/paused/)
      expect(() => assertEmailSenderAllowed('owner@example.com', 'owner@example.com')).not.toThrow()
    } finally {
      if (previous === undefined) delete process.env.EMAIL_QUEUE_BLOCKED_SENDERS
      else process.env.EMAIL_QUEUE_BLOCKED_SENDERS = previous
    }
  })
})
