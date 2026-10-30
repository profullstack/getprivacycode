export function assertEmailSenderAllowed(...addresses: Array<string | undefined>) {
  const blocked = new Set(
    (process.env.EMAIL_QUEUE_BLOCKED_SENDERS ?? '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean),
  )
  if (addresses.some((address) => address && blocked.has(address.trim().toLowerCase()))) {
    throw new Error('Outbound sending from this mailbox is paused for administrator review.');
  }
}
