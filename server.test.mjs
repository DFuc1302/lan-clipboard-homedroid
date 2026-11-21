import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createLanClipboard, dataDirectory, hashKey, sanitizeFilename } from "./server.mjs";
import { createServer } from "node:http";

assert.equal(sanitizeFilename("../bad:name?.txt"), "bad_name_.txt");
assert.equal(hashKey("a").length, 64);
assert.match(dataDirectory("/srv/lan-clipboard"), /lan-clipboard-data$/);

test("claim, clipboard and file transfer require the pairing key", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lan-clipboard-"));
  const app = await createLanClipboard({ dataDir: dir });
  const server = createServer(app.handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const claim = await fetch(`${origin}/api/claim`, { method: "POST" }).then((response) => response.json());
    assert.ok(claim.key);
    assert.equal((await fetch(`${origin}/api/state`)).status, 401);
    const headers = { Authorization: `Bearer ${claim.key}` };
    assert.equal((await fetch(`${origin}/api/clipboard`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ text: "hello LAN" }) })).status, 201);
    assert.equal((await fetch(`${origin}/api/files?name=test.txt`, { method: "POST", headers: { ...headers, "content-type": "text/plain" }, body: "file body" })).status, 201);
    const state = await fetch(`${origin}/api/state`, { headers }).then((response) => response.json());
    assert.equal(state.clips[0].text, "hello LAN");
    assert.equal(state.files[0].name, "test.txt");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
