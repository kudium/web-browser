import { test } from "node:test";
import assert from "node:assert/strict";
import { selectRelease } from "./select-browser-release.mjs";

test("selects stable or automatically numbers successive betas", () => {
  const tags = ["v1.0.1", "v1.0.2-beta.1", "v1.0.2-beta.3"];
  assert.equal(selectRelease("1.0.2", "stable", tags), "v1.0.2");
  assert.equal(selectRelease("1.0.2", "beta", tags), "v1.0.2-beta.4");
  assert.equal(selectRelease(" v1.0.3 ", "beta", tags), "v1.0.3-beta.1");
});
test("rejects used or older versions and invalid input", () => {
  for (const version of ["1.0.1", "0.9.9", "1.0.0"])
    assert.throws(() => selectRelease(version, "stable", ["v1.0.1"]));
  for (const version of [
    "01.0.2",
    "1.0.2-beta.1",
    "1.0",
    "1.0.2\nmalicious",
    "9007199254740992.0.0",
  ])
    assert.throws(() => selectRelease(version, "beta", []));
  assert.throws(() => selectRelease("1.0.2", "production", []));
});
