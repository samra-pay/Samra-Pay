/** Dedicated verified segment only. A Resend unsubscribe can never be overwritten by this adapter. */
export function createResendContactAdapter({
  transport,
  suppression,
  segmentId,
  topicId,
}) {
  if (
    !/^[a-f0-9-]{36}$/.test(segmentId ?? "") ||
    !/^[a-f0-9-]{36}$/.test(topicId ?? "")
  )
    throw new Error("VERIFIED_RESEND_SEGMENT_REQUIRED");
  return Object.freeze({
    async submit({ email, member }) {
      if (member && (await suppression.getSuppression(email)))
        return { state: "suppressed", requestId: "suppressed" };
      const existing = await transport.getContact(email);
      if (!member) {
        if (existing && !existing.unsubscribed)
          await transport.unsubscribeContact(existing.id);
        return { state: "accepted", requestId: existing?.id ?? "absent" };
      }
      if (existing?.unsubscribed)
        return { state: "suppressed", requestId: "unsubscribed" };
      if (!existing) {
        const created = await transport.createContact({
          email,
          segmentId,
          topicId,
        });
        return { state: "accepted", requestId: created.id };
      }
      await transport.addContactToSegment({
        contactId: existing.id,
        segmentId,
      });
      await transport.optContactIntoTopic({ contactId: existing.id, topicId });
      return { state: "accepted", requestId: existing.id };
    },
    async status() {
      throw new Error("RESEND_SYNC_REQUIRES_RECONCILIATION");
    },
  });
}
