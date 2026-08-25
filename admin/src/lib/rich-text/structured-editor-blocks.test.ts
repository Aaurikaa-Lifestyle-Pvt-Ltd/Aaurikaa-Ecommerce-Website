import assert from "node:assert/strict";
import test from "node:test";
import { transformTopLevelBlocks } from "./structured-editor-blocks.ts";

const para = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

test("transformTopLevelBlocks moves a block up", () => {
  const doc = [para("A"), para("B"), para("C")];
  assert.deepEqual(
    transformTopLevelBlocks(doc, 1, "up").map((n) => (n.content as { text: string }[])[0].text),
    ["B", "A", "C"],
  );
});

test("transformTopLevelBlocks moves a block down", () => {
  const doc = [para("A"), para("B"), para("C")];
  assert.deepEqual(
    transformTopLevelBlocks(doc, 0, "down").map((n) => (n.content as { text: string }[])[0].text),
    ["B", "A", "C"],
  );
});

test("transformTopLevelBlocks does not move the first block up", () => {
  const doc = [para("A"), para("B"), para("C")];
  assert.equal(transformTopLevelBlocks(doc, 0, "up"), doc);
});

test("transformTopLevelBlocks duplicates the current block", () => {
  const doc = [para("A"), para("B"), para("C")];
  const next = transformTopLevelBlocks(doc, 1, "duplicate");
  assert.equal(next.length, 4);
  assert.equal((next[1].content as { text: string }[])[0].text, "B");
  assert.equal((next[2].content as { text: string }[])[0].text, "B");
  assert.notEqual(next[2], next[1]);
});

test("transformTopLevelBlocks deletes a block and keeps at least one paragraph", () => {
  const doc = [para("A"), para("B"), para("C")];
  assert.equal(transformTopLevelBlocks(doc, 1, "delete").length, 2);
  assert.deepEqual(transformTopLevelBlocks([para("only")], 0, "delete"), [{ type: "paragraph" }]);
});
