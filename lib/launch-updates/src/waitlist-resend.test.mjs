import assert from "node:assert/strict";
import { test } from "node:test";
import { createResendWaitlistTransport } from "./waitlist-resend.mjs";

const KEY = "re_unit_test_not_a_real_key_123456";
const EMAIL = "reader+launch@example.com";
const CONTACT_ID = "2d9e473e-9e66-43c2-8c08-375de4c96bf9";
const SEGMENT_ID = "3302de0a-0f51-4c3e-9f4e-f26ebf95f412";
const TOPIC_ID = "244e46ec-7cda-4cf2-8e6e-1e13093125ab";

function setup(responses, options = {}) {
  const requests = [];
  const queue = [...responses];
  const transport = createResendWaitlistTransport({
    apiKey: KEY,
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      const response = queue.shift();
      assert.ok(response, "unexpected provider request");
      return response;
    },
    ...options,
  });
  return { transport, requests };
}

function contact(unsubscribed = false) {
  return Response.json({
    object: "contact",
    id: CONTACT_ID,
    email: EMAIL,
    unsubscribed,
  });
}

test("requires a server-held Resend key and injected network client", () => {
  for (const input of [
    undefined,
    {},
    { apiKey: KEY },
    { apiKey: "bad", fetchImpl() {} },
  ]) {
    assert.throws(
      () => createResendWaitlistTransport(input),
      /INVALID_CONFIGURATION/u,
    );
  }
});

test("retrieves an existing contact without returning its email", async () => {
  const { transport, requests } = setup([contact(true)]);
  assert.deepEqual(await transport.getContact(" Reader+Launch@Example.COM "), {
    id: CONTACT_ID,
    unsubscribed: true,
  });
  assert.equal(
    requests[0].url,
    "https://api.resend.com/contacts/reader%2Blaunch%40example.com",
  );
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(
    requests[0].options.headers["User-Agent"],
    "SamraPay-Waitlist/1.0",
  );
});

test("returns null only for a missing contact", async () => {
  const { transport } = setup([new Response(null, { status: 404 })]);
  assert.equal(await transport.getContact(EMAIL), null);
});

test("creates a subscribed contact in the exact segment and topic", async () => {
  const { transport, requests } = setup([
    Response.json({ object: "contact", id: CONTACT_ID }, { status: 201 }),
  ]);
  assert.deepEqual(
    await transport.createContact({
      email: " Reader+Launch@Example.COM ",
      segmentId: SEGMENT_ID,
      topicId: TOPIC_ID,
    }),
    { id: CONTACT_ID },
  );
  assert.equal(requests[0].url, "https://api.resend.com/contacts");
  assert.equal(requests[0].options.method, "POST");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    email: EMAIL,
    unsubscribed: false,
    segments: [{ id: SEGMENT_ID }],
    topics: [{ id: TOPIC_ID, subscription: "opt_in" }],
  });
});

test("adds an existing contact to the segment and opts it into the topic", async () => {
  const { transport, requests } = setup([
    Response.json({ id: SEGMENT_ID }),
    Response.json({ id: CONTACT_ID }),
  ]);
  await transport.addContactToSegment({
    contactId: CONTACT_ID,
    segmentId: SEGMENT_ID,
  });
  await transport.optContactIntoTopic({
    contactId: CONTACT_ID,
    topicId: TOPIC_ID,
  });
  assert.equal(
    requests[0].url,
    `https://api.resend.com/contacts/${CONTACT_ID}/segments/${SEGMENT_ID}`,
  );
  assert.equal(requests[0].options.method, "POST");
  assert.equal(
    requests[1].url,
    `https://api.resend.com/contacts/${CONTACT_ID}/topics`,
  );
  assert.equal(requests[1].options.method, "PATCH");
  assert.deepEqual(JSON.parse(requests[1].options.body), {
    topics: [{ id: TOPIC_ID, subscription: "opt_in" }],
  });
});

test("treats existing segment membership as idempotent", async () => {
  const { transport } = setup([new Response(null, { status: 409 })]);
  await assert.doesNotReject(
    transport.addContactToSegment({
      contactId: CONTACT_ID,
      segmentId: SEGMENT_ID,
    }),
  );
});

test("paces provider calls to the configured request interval", async () => {
  let time = 1_000;
  const waits = [];
  const { transport } = setup([contact(), contact()], {
    minimumIntervalMs: 550,
    clock: () => time,
    sleep: async (milliseconds) => {
      waits.push(milliseconds);
      time += milliseconds;
    },
  });
  await transport.getContact(EMAIL);
  await transport.getContact(EMAIL);
  assert.deepEqual(waits, [550]);
});

test("fails closed on malformed IDs and provider failures without exposing input", async () => {
  const { transport, requests } = setup([
    Response.json({ message: `${EMAIL} ${KEY}` }, { status: 500 }),
  ]);
  await assert.rejects(
    transport.createContact({
      email: EMAIL,
      segmentId: "bad",
      topicId: TOPIC_ID,
    }),
    /INVALID_REQUEST/u,
  );
  assert.equal(requests.length, 0);
  await assert.rejects(transport.getContact(EMAIL), (error) => {
    assert.equal(error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(String(error).includes(EMAIL), false);
    assert.equal(String(error).includes(KEY), false);
    return true;
  });
});
