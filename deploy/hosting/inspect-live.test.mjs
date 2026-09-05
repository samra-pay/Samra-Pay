import assert from "node:assert/strict";
import test from "node:test";
import {
  PROJECT,
  PROJECT_NUMBER,
  SITE,
  canonical,
  digest,
  inspectLive,
  runCli,
} from "./inspect-live.mjs";

const API = "https://firebasehosting.googleapis.com/v1beta1/";
const LIVE = `sites/${SITE}/channels/live`;
const VERSION = `sites/${SITE}/versions/version_1`;
const RELEASE = `sites/${SITE}/releases/release_1`;
const TOKEN = "unit-test-only-private-token";
const NOW = "2026-09-05T17:30:00.000Z";
function fixture() {
  return {
    site: {
      name: `projects/${PROJECT_NUMBER}/sites/${SITE}`,
      defaultUrl: `https://${SITE}.web.app`,
    },
    channel: {
      name: LIVE,
      release: {
        name: RELEASE,
        type: "DEPLOY",
        version: { name: VERSION },
        releaseTime: "2026-09-04T10:30:00.123456789Z",
        message: "Reviewed static release",
      },
    },
    version: {
      name: VERSION,
      status: "FINALIZED",
      config: {
        trailingSlashBehavior: "REMOVE",
        rewrites: [{ glob: "**", path: "/index.html" }],
        headers: [{ glob: "**", headers: { "X-Frame-Options": "DENY" } }],
      },
      fileCount: "2",
    },
    pages: [
      {
        files: [
          { path: "/index.html", hash: "a".repeat(64), status: "ACTIVE" },
        ],
        nextPageToken: "second+/=",
      },
      {
        files: [
          {
            path: "/assets/image.webp",
            hash: "b".repeat(64),
            status: "ACTIVE",
          },
        ],
      },
    ],
  };
}
function harness(data = fixture(), override) {
  const calls = [];
  let page = 0;
  let channels = 0;
  const fetcher = async (url, options) => {
    calls.push({ url, options });
    assert.equal(
      options.method,
      "GET",
      "Inspector must never issue a cloud mutation",
    );
    assert.equal(options.redirect, "error");
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, `Bearer ${TOKEN}`);
    assert(url.startsWith(API));
    const name = url.slice(API.length);
    let body;
    if (name === `projects/${PROJECT_NUMBER}/sites/${SITE}`) body = data.site;
    else if (name === LIVE)
      body = channels++ === 0 ? data.channel : (data.ending ?? data.channel);
    else if (name === VERSION) body = data.version;
    else if (name.startsWith(`${VERSION}/files?`)) {
      const query = new URL(url).searchParams;
      assert.equal(query.get("status"), "ACTIVE");
      assert.equal(query.get("pageSize"), "1000");
      if (page > 0)
        assert.equal(
          query.get("pageToken"),
          data.pages[page - 1].nextPageToken,
        );
      body = data.pages[page++];
    } else assert.fail("Unexpected or untrusted API resource");
    if (override) {
      const replacement = override({ name, body, calls });
      if (replacement) return replacement;
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return {
    calls,
    run: () => inspectLive({ token: TOKEN, fetcher, now: () => new Date(NOW) }),
  };
}

test("snapshots the fixed project's current live channel with complete sorted files and stable hashes", async () => {
  const { calls, run } = harness();
  const result = await run();
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.projectId, PROJECT);
  assert.equal(result.projectNumber, PROJECT_NUMBER);
  assert.equal(result.site, SITE);
  assert.equal(result.releaseName, RELEASE);
  assert.equal(result.versionName, VERSION);
  assert.equal(result.inspectedAt, NOW);
  assert.deepEqual(
    result.files.map((file) => file.path),
    ["/assets/image.webp", "/index.html"],
  );
  assert.equal(
    result.configSha256,
    digest(canonical(fixture().version.config)),
  );
  assert.equal(result.filesSha256, digest(canonical(result.files)));
  assert.equal(calls.filter((call) => call.url === API + LIVE).length, 2);
  assert(calls.every((call) => !call.url.includes("/releases?")));
  assert(!JSON.stringify(result).includes(TOKEN));
});

test("canonical hashes preserve ordered rules and ignore object insertion order", () => {
  assert.equal(
    canonical({ b: 2, a: [{ z: 1, y: 2 }] }),
    canonical({ a: [{ y: 2, z: 1 }], b: 2 }),
  );
  assert.notEqual(canonical({ rules: [1, 2] }), canonical({ rules: [2, 1] }));
  for (const value of [undefined, NaN, Infinity, new Date(), { x: undefined }])
    assert.throws(() => canonical(value));
});

for (const type of ["ROLLBACK", "TYPE_UNSPECIFIED", undefined]) {
  test(`accepts a finalized current ${type ?? "omitted/default"} release`, async () => {
    const data = fixture();
    data.channel.release.type = type;
    if (type === "ROLLBACK")
      data.channel.release.name = `sites/${SITE}/channels/live/releases/rollback_1`;
    assert.equal((await harness(data).run()).versionName, VERSION);
  });
}

const invalidCases = [
  [
    "wrong project",
    (d) => {
      d.site.name = `projects/934122615631/sites/${SITE}`;
    },
    /expected production project/,
  ],
  [
    "wrong site",
    (d) => {
      d.site.name = `projects/${PROJECT_NUMBER}/sites/other`;
    },
    /expected production project/,
  ],
  [
    "wrong default URL",
    (d) => {
      d.site.defaultUrl = "https://example.com";
    },
    /default Hosting URL/,
  ],
  [
    "preview channel",
    (d) => {
      d.channel.name = `sites/${SITE}/channels/pr-169`;
    },
    /Unexpected Hosting channel/,
  ],
  [
    "preview release",
    (d) => {
      d.channel.release.name = `sites/${SITE}/channels/pr-169/releases/a`;
    },
    /unexpected live release/,
  ],
  [
    "disabled site",
    (d) => {
      d.channel.release.type = "SITE_DISABLE";
    },
    /disabled/,
  ],
  [
    "unknown release type",
    (d) => {
      d.channel.release.type = "FUTURE_TYPE";
    },
    /unsupported/,
  ],
  [
    "missing release",
    (d) => {
      delete d.channel.release;
    },
    /Missing/,
  ],
  [
    "cross-site version",
    (d) => {
      d.channel.release.version.name = "sites/other/versions/v";
    },
    /unexpected version/,
  ],
  [
    "traversal version",
    (d) => {
      d.channel.release.version.name = `sites/${SITE}/versions/../other`;
    },
    /unexpected version/,
  ],
  [
    "returned wrong version",
    (d) => {
      d.version.name = `sites/${SITE}/versions/other`;
    },
    /identity mismatch/,
  ],
  [
    "unfinalized version",
    (d) => {
      d.version.status = "CREATED";
    },
    /not FINALIZED/,
  ],
  [
    "expired version",
    (d) => {
      d.version.status = "EXPIRED";
    },
    /not FINALIZED/,
  ],
  [
    "missing config",
    (d) => {
      delete d.version.config;
    },
    /configuration is missing/,
  ],
  [
    "conflicting embedded config",
    (d) => {
      d.channel.release.version.config = { cleanUrls: true };
    },
    /configuration mismatch/,
  ],
  [
    "conflicting embedded status",
    (d) => {
      d.channel.release.version.status = "DELETED";
    },
    /status mismatch/,
  ],
  [
    "invalid time",
    (d) => {
      d.channel.release.releaseTime = "last Friday";
    },
    /release time/,
  ],
  [
    "invalid hash",
    (d) => {
      d.pages[0].files[0].hash = "not-a-hash";
    },
    /SHA256/,
  ],
  [
    "inactive file",
    (d) => {
      d.pages[0].files[0].status = "EXPECTED";
    },
    /not ACTIVE/,
  ],
  [
    "duplicate path",
    (d) => {
      d.pages[1].files[0].path = "/index.html";
    },
    /Duplicate/,
  ],
  [
    "incomplete files",
    (d) => {
      delete d.pages[0].nextPageToken;
    },
    /incomplete/,
  ],
  [
    "missing file count",
    (d) => {
      delete d.version.fileCount;
    },
    /file count/,
  ],
  [
    "excessive file count",
    (d) => {
      d.version.fileCount = "10001";
    },
    /file count/,
  ],
  [
    "malformed page token",
    (d) => {
      d.pages[0].nextPageToken = { token: "a" };
    },
    /pagination token/,
  ],
  [
    "repeated page token",
    (d) => {
      d.pages[1].nextPageToken = d.pages[0].nextPageToken;
    },
    /Repeated/,
  ],
  [
    "changed live release",
    (d) => {
      d.ending = structuredClone(d.channel);
      d.ending.release.name = `sites/${SITE}/releases/release_2`;
    },
    /changed during inspection/,
  ],
];
for (const [name, change, expected] of invalidCases) {
  test(`rejects ${name}`, async () => {
    const data = fixture();
    change(data);
    await assert.rejects(harness(data).run(), expected);
  });
}

for (const path of [
  "/../secret",
  "/assets/../secret",
  "/%2e%2e/secret",
  "/assets/%252e%252e/secret",
  "//example.com/a",
  "/assets\\secret",
  "/a?x=1",
  "/a#x",
  "/.env",
  "relative.webp",
  "/a\u0000b",
  "/assets//image.webp",
]) {
  test(`rejects unsafe path ${JSON.stringify(path)}`, async () => {
    const data = fixture();
    data.pages[0].files[0].path = path;
    await assert.rejects(harness(data).run(), /Unsafe Hosting file path/);
  });
}

test("bounds file pagination even when every token is new", async () => {
  const data = fixture();
  data.pages = Array.from({ length: 21 }, (_, i) => ({
    files: [],
    nextPageToken: `page${i + 1}`,
  }));
  const { run, calls } = harness(data);
  await assert.rejects(run(), /pagination exceeds/);
  assert.equal(calls.filter((call) => call.url.includes("/files?")).length, 20);
});

for (const status of [301, 403, 404, 500]) {
  test(`rejects HTTP ${status} without disclosing the response body`, async () => {
    await assert.rejects(
      harness(
        fixture(),
        () => new Response(`SECRET ${TOKEN}`, { status }),
      ).run(),
      (error) => {
        assert(error.message.includes(`HTTP ${status}`));
        assert(!error.message.includes(TOKEN));
        assert(!error.message.includes("SECRET"));
        return true;
      },
    );
  });
}
test("rejects redirects even if a fetch implementation followed one", async () => {
  await assert.rejects(
    harness(fixture(), () => ({
      redirected: true,
      url: "https://example.com",
    })).run(),
    /redirects/,
  );
});
test("rejects an unexpected response URL", async () => {
  await assert.rejects(
    harness(fixture(), () => ({
      redirected: false,
      url: "https://example.com",
    })).run(),
    /response URL/,
  );
});
test("rejects oversized and malformed JSON responses without their contents", async () => {
  for (const response of [
    new Response("PRIVATE malformed JSON"),
    new Response("x".repeat(2_000_001)),
    new Response("{}", { headers: { "content-length": "2000001" } }),
  ]) {
    await assert.rejects(harness(fixture(), () => response).run(), (error) => {
      assert(!error.message.includes("PRIVATE"));
      return /limit|unreadable/.test(error.message);
    });
  }
});
test("sanitizes fetch errors that may contain credentials", async () => {
  await assert.rejects(
    inspectLive({
      token: TOKEN,
      fetcher: async () => {
        throw new Error(TOKEN);
      },
    }),
    (error) =>
      !error.message.includes(TOKEN) &&
      /Hosting read failed/.test(error.message),
  );
});

test("CLI uses the explicit existing operator privately and writes only safe metadata", async () => {
  const operator = "operator@example.com";
  const commands = [];
  const output = [];
  const saves = [];
  const snapshot = await harness().run();
  await runCli(["--operator", operator, "--output", "/tmp/live.json"], {
    run: (command, args, options) => {
      commands.push([command, args]);
      assert.deepEqual(options.stdio, ["ignore", "pipe", "pipe"]);
      if (args[0] === "config") return "(unset)\n";
      return args[1] === "list" ? `${operator}\n` : `${TOKEN}\n`;
    },
    inspect: async ({ token }) => {
      assert.equal(token, TOKEN);
      return snapshot;
    },
    save: async (...args) => saves.push(args),
    print: (line) => output.push(line),
  });
  assert.deepEqual(
    commands.map(([, args]) => args.slice(0, 2)),
    [
      ["auth", "list"],
      ["config", "get-value"],
      ["auth", "print-access-token"],
    ],
  );
  assert(commands[2][1].includes(`--account=${operator}`));
  assert.equal(saves[0][0], "/tmp/live.json");
  assert.deepEqual(saves[0][2], { flag: "wx", mode: 0o600 });
  assert(!JSON.stringify(saves).includes(TOKEN));
  assert(!output.join("\n").includes(TOKEN));
});
test("CLI rejects mismatched identity before requesting a token", async () => {
  let calls = 0;
  await assert.rejects(
    runCli(
      ["--operator", "operator@example.com", "--output", "/tmp/live.json"],
      {
        run: () => {
          calls++;
          return "other@example.com";
        },
      },
    ),
    /Active Google account/,
  );
  assert.equal(calls, 1);
});
test("CLI refuses configured impersonation", async () => {
  const operator = "operator@example.com";
  let calls = 0;
  await assert.rejects(
    runCli(["--operator", operator, "--output", "/tmp/live.json"], {
      run: () =>
        ++calls === 1
          ? operator
          : "publisher@elsewhere.iam.gserviceaccount.com",
    }),
    /impersonation/,
  );
  assert.equal(calls, 2);
});
test("CLI never returns raw gcloud failures", async () => {
  await assert.rejects(
    runCli(
      ["--operator", "operator@example.com", "--output", "/tmp/live.json"],
      {
        run: () => {
          throw new Error(TOKEN);
        },
      },
    ),
    (error) =>
      /authentication is unavailable/.test(error.message) &&
      !error.message.includes(TOKEN),
  );
});
