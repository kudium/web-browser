import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRelease } from "./select-browser-release.mjs";

test("automatically starts, continues and graduates a beta version", () => {
  const tags = ["v1.0.1"];
  const first = selectRelease("auto", "beta", tags);
  assert.equal(first, "v1.0.2-beta.1");
  tags.push(first);
  const second = selectRelease("auto", "beta", tags);
  assert.equal(second, "v1.0.2-beta.2");
  tags.push(second);
  const stable = selectRelease("auto", "stable", tags);
  assert.equal(stable, "v1.0.2");
  tags.push(stable);
  assert.equal(selectRelease("auto", "beta", tags), "v1.0.3-beta.1");
});
test("supports automatic stable releases and explicit patch, minor and major bumps", () => {
  const tags = ["v1.0.0", "v1.0.1"];
  assert.equal(selectRelease("auto", "stable", tags), "v1.0.2");
  assert.equal(selectRelease("patch", "stable", tags), "v1.0.2");
  assert.equal(selectRelease("minor", "beta", tags), "v1.1.0-beta.1");
  assert.equal(selectRelease("major", "stable", tags), "v2.0.0");
  assert.equal(
    selectRelease("major", "beta", [...tags, "v2.0.0-beta.2"]),
    "v2.0.0-beta.3"
  );
});
test("auto continues a pending minor beta and compares versions numerically", () => {
  const tags = ["v1.9.9", "v1.10.0", "v1.11.0-beta.3", "v1.10.1-beta.5"];
  assert.equal(selectRelease("auto", "stable", tags), "v1.11.0");
  assert.equal(selectRelease("auto", "beta", tags), "v1.11.0-beta.4");
  assert.equal(selectRelease("patch", "stable", tags), "v1.10.1");
});
test("handles a fresh repository and ignores unrelated tags", () => {
  assert.equal(
    selectRelease("auto", "beta", [
      "latest",
      "v01.0.0",
      "v999999999999999999999.0.0",
    ]),
    "v0.0.1-beta.1"
  );
  assert.equal(selectRelease("major", "stable", []), "v1.0.0");
});
test("rejects invalid selections and numeric overflow", () => {
  assert.throws(() => selectRelease("auto", "production", []));
  assert.throws(() => selectRelease("1.0.2", "stable", []));
  assert.throws(() =>
    selectRelease("patch", "stable", ["v1.0.9007199254740991"])
  );
  assert.throws(() =>
    selectRelease("auto", "beta", ["v1.0.1-beta.9007199254740991"])
  );
});
