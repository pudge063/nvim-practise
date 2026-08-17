// Pure-logic tests for js/vim.js — no DOM, no framework, runs with Node's
// built-in test runner: `node --test tests/`. Kept dependency-free on
// purpose, same spirit as ADR-0001 (no frameworks) even though this is
// dev tooling rather than shipped app code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { VimEngine } from "../js/vim.js";

function keys(engine, seq) {
  for (const k of seq) engine.handleKey(k);
}

test("w moves to start of next word, wraps to next line", () => {
  const e = new VimEngine("hello world\nfoo bar baz", "t.txt");
  keys(e, ["w"]);
  assert.equal(e.cursor.row, 0);
  assert.equal(e.cursor.col, 6);
  keys(e, ["w"]);
  assert.equal(e.cursor.row, 1);
  assert.equal(e.cursor.col, 0);
});

test("e moves to end of word, b moves back to start of the previous word", () => {
  const e = new VimEngine("hello world", "t.txt");
  keys(e, ["e"]);
  assert.equal(e.cursor.col, 4); // end of "hello"
  keys(e, ["w"]);
  assert.equal(e.cursor.col, 6); // start of "world"
  keys(e, ["b"]);
  assert.equal(e.cursor.col, 0); // back to start of "hello"
});

test("count prefix: 3w moves 3 words", () => {
  const e = new VimEngine("one two three four five", "t.txt");
  keys(e, ["3", "w"]);
  assert.ok(e.lines[0].slice(e.cursor.col).startsWith("four"));
});

test("dd deletes and linewise-yanks the current line; p pastes after", () => {
  const e = new VimEngine("a\nb\nc", "t.txt");
  keys(e, ["d", "d"]);
  assert.equal(e.lines.join("|"), "b|c");
  assert.equal(e.register.text, "a");
  assert.equal(e.register.linewise, true);
  keys(e, ["p"]);
  assert.equal(e.lines.join("|"), "b|a|c");
});

test("dw deletes word plus trailing space", () => {
  const e = new VimEngine("foo bar baz", "t.txt");
  keys(e, ["d", "w"]);
  assert.equal(e.lines[0], "bar baz");
});

test("diw deletes only the word, aw also eats one surrounding space", () => {
  const inner = new VimEngine("foo bar baz", "t.txt");
  keys(inner, ["w", "d", "i", "w"]);
  assert.equal(inner.lines[0], "foo  baz");

  const around = new VimEngine("foo bar baz", "t.txt");
  keys(around, ["w", "d", "a", "w"]);
  assert.equal(around.lines[0], "foo baz");
});

test("x deletes char under cursor, r replaces one char", () => {
  const xE = new VimEngine("cat", "t.txt");
  keys(xE, ["x"]);
  assert.equal(xE.lines[0], "at");

  const rE = new VimEngine("cat", "t.txt");
  keys(rE, ["r", "b"]);
  assert.equal(rE.lines[0], "bat");
});

test("insert-mode entry points: i, A, o", () => {
  const i = new VimEngine("bar", "t.txt");
  keys(i, ["i", "f", "o", "o", " ", "Escape"]);
  assert.equal(i.lines[0], "foo bar");

  const A = new VimEngine("foo", "t.txt");
  keys(A, ["A", "!", "Escape"]);
  assert.equal(A.lines[0], "foo!");

  const o = new VimEngine("foo", "t.txt");
  keys(o, ["o", "b", "a", "r", "Escape"]);
  assert.equal(o.lines.join("|"), "foo|bar");
});

test("undo/redo round-trip", () => {
  const e = new VimEngine("foo", "t.txt");
  keys(e, ["x"]);
  assert.equal(e.lines[0], "oo");
  keys(e, ["u"]);
  assert.equal(e.lines[0], "foo");
  keys(e, ["<C-r>"]);
  assert.equal(e.lines[0], "oo");
});

test("editCount stays monotonic across undo (backs the undo task's check)", () => {
  const e = new VimEngine("foo", "t.txt");
  keys(e, ["x", "u"]);
  assert.equal(e.lines[0], "foo");
  assert.ok(e.editCount >= 1);
});

test("visual charwise delete", () => {
  const e = new VimEngine("hello world", "t.txt");
  keys(e, ["v", "l", "l", "l", "d"]);
  assert.equal(e.lines[0], "o world");
});

test("visual line delete spanning two lines", () => {
  const e = new VimEngine("one\ntwo\nthree", "t.txt");
  keys(e, ["V", "j", "d"]);
  assert.equal(e.lines.join("|"), "three");
});

test("gg/G and explicit-count G", () => {
  const e = new VimEngine("a\nb\nc\nd", "t.txt");
  keys(e, ["G"]);
  assert.equal(e.cursor.row, 3);
  keys(e, ["g", "g"]);
  assert.equal(e.cursor.row, 0);
  keys(e, ["2", "G"]);
  assert.equal(e.cursor.row, 1);
});

test("operator + G respects an explicit count (d2G from line 4)", () => {
  const e = new VimEngine("a\nb\nc\nd\ne", "t.txt");
  e.setCursor(3, 0); // row 3 = "d"
  keys(e, ["d", "2", "G"]);
  // deletes lines 2..4 (rows 1..3): b, c, d
  assert.equal(e.lines.join("|"), "a|e");
});

test("search: / jumps to first match, n repeats forward and wraps", () => {
  const e = new VimEngine("alpha\nbeta\ngamma\nbeta again", "t.txt");
  keys(e, ["/", "b", "e", "t", "a", "Enter"]);
  assert.equal(e.cursor.row, 1);
  assert.equal(e.cursor.col, 0);
  keys(e, ["n"]);
  assert.equal(e.cursor.row, 3);
});

test(":sort sorts the whole buffer", () => {
  const e = new VimEngine("banana\napple\ncherry", "t.txt");
  keys(e, [":", "s", "o", "r", "t", "Enter"]);
  assert.equal(e.lines.join("|"), "apple|banana|cherry");
});

test("visual ':' prefills '<,'> and '<,'>sort sorts only the selection", () => {
  const e = new VimEngine("banana\napple\ncherry", "t.txt");
  keys(e, ["V", "j", "j", ":"]);
  assert.equal(e.cmdline, "'<,'>");
  keys(e, ["s", "o", "r", "t", "Enter"]);
  assert.equal(e.lines.join("|"), "apple|banana|cherry");
});

test(":s replaces first match only, :%s///g replaces every match everywhere", () => {
  const local = new VimEngine("foo foo foo", "t.txt");
  keys(local, [":", "s", "/", "f", "o", "o", "/", "b", "a", "r", "/", "Enter"]);
  assert.equal(local.lines[0], "bar foo foo");

  const global = new VimEngine("foo foo foo", "t.txt");
  keys(global, [":", "%", "s", "/", "f", "o", "o", "/", "b", "a", "r", "/", "g", "Enter"]);
  assert.equal(global.lines[0], "bar bar bar");
});

test(":w / :q invoke the onSave/onQuit callbacks with the current buffer", () => {
  let saved = null;
  let quit = false;
  const e = new VimEngine("x", "t.txt", { onSave: (text) => (saved = text), onQuit: () => (quit = true) });
  keys(e, [":", "w", "Enter"]);
  assert.equal(saved, "x");
  keys(e, [":", "q", "Enter"]);
  assert.equal(quit, true);
});

test("operator + f{char}: df) deletes up to and including the char", () => {
  const e = new VimEngine("remove(this) please", "t.txt");
  keys(e, ["d", "f", ")"]);
  assert.equal(e.lines[0], " please");
});

test("setCursor seeds a task's starting position without counting as an edit", () => {
  const e = new VimEngine("a\nb\nc", "t.txt");
  e.setCursor(2, 0);
  assert.equal(e.cursor.row, 2);
  assert.equal(e.editCount, 0);
  assert.equal(e.undoStack.length, 0);
});
