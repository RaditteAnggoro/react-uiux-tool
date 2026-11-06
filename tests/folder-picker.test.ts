import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDirectory } from "../src/server/folder-picker.js";

test("native picker distinguishes selection, cancellation and failure", async () => {
  const selected = await pickDirectory("darwin", async (command, args) => {
    assert.equal(command, "osascript");
    assert.match(args[1]!, /choose folder/);
    return { stdout: "/tmp/React Project\n" };
  });
  assert.deepEqual(selected, { path: "/tmp/React Project", unavailable: false });
  assert.deepEqual(await pickDirectory("darwin", async () => {
    throw Object.assign(new Error("cancelled"), { stderr: "execution error: User canceled. (-128)" });
  }), { path: "", unavailable: false });
  assert.deepEqual(await pickDirectory("darwin", async () => {
    throw Object.assign(new Error("not permitted"), { stderr: "execution error: Not authorized. (-1743)" });
  }), { path: "", unavailable: true });
  assert.deepEqual(await pickDirectory("linux", async () => {
    throw Object.assign(new Error("cancelled"), { code: 1, stderr: "" });
  }), { path: "", unavailable: false });
  assert.deepEqual(await pickDirectory("win32", async () => ({ stdout: "" })), { path: "", unavailable: false });
});
