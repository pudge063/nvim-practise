// Hand-rolled vim emulator. Scope is deliberately limited — see
// docs/adr/0003-vim-emulator-scope.md for exactly what is and isn't here
// and why. This module is DOM-free on purpose: it only knows about text,
// not pixels — terminal.js renders whatever getState() returns.

function classify(ch) {
  if (ch === undefined) return "space";
  if (/\s/.test(ch)) return "space";
  if (/\w/.test(ch)) return "word";
  return "punct";
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function wordForwardOnce(lines, row, col) {
  let line = lines[row];
  if (line.length === 0 || col >= line.length) {
    if (row < lines.length - 1) return { row: row + 1, col: 0 };
    return { row, col: Math.max(0, line.length) };
  }
  const startCls = classify(line[col]);
  if (startCls !== "space") {
    while (col < line.length && classify(line[col]) === startCls) col++;
  }
  for (;;) {
    if (col >= line.length) {
      if (row < lines.length - 1) {
        row++;
        line = lines[row];
        col = 0;
        if (line.length === 0) return { row, col: 0 };
        continue;
      }
      return { row, col: Math.max(0, line.length - 1) };
    }
    if (classify(line[col]) === "space") col++;
    else return { row, col };
  }
}

function wordBackwardOnce(lines, row, col) {
  let line = lines[row];
  if (col === 0) {
    if (row === 0) return { row: 0, col: 0 };
    row--;
    line = lines[row];
    col = line.length;
  }
  col--;
  while (col >= 0 && classify(line[col]) === "space") {
    col--;
    if (col < 0) {
      if (row === 0) return { row: 0, col: 0 };
      row--;
      line = lines[row];
      col = line.length - 1;
    }
  }
  if (col < 0) return { row, col: 0 };
  const cls = classify(line[col]);
  while (col > 0 && classify(line[col - 1]) === cls) col--;
  return { row, col: Math.max(0, col) };
}

function endOfWordOnce(lines, row, col) {
  let line = lines[row];
  col++;
  for (;;) {
    if (col >= line.length) {
      if (row < lines.length - 1) {
        row++;
        line = lines[row];
        col = 0;
        if (line.length === 0) continue;
        if (classify(line[0]) !== "space") return { row, col: 0 };
        continue;
      }
      return { row, col: Math.max(0, line.length - 1) };
    }
    if (classify(line[col]) === "space") {
      col++;
      continue;
    }
    const cls = classify(line[col]);
    while (col + 1 < line.length && classify(line[col + 1]) === cls) col++;
    return { row, col };
  }
}

// inner/around word text object at (row, col) -> {startCol, endCol} inclusive, same row
function wordObject(lines, row, col, around) {
  const line = lines[row];
  if (line.length === 0) return { startCol: 0, endCol: 0 };
  const cls = classify(line[clamp(col, 0, line.length - 1)]);
  let start = col;
  let end = col;
  while (start > 0 && classify(line[start - 1]) === cls) start--;
  while (end < line.length - 1 && classify(line[end + 1]) === cls) end++;
  if (around) {
    let trailEnd = end;
    while (trailEnd < line.length - 1 && classify(line[trailEnd + 1]) === "space") trailEnd++;
    if (trailEnd === end) {
      while (start > 0 && classify(line[start - 1]) === "space") start--;
    } else {
      end = trailEnd;
    }
  }
  return { startCol: start, endCol: end };
}

const MODE = {
  NORMAL: "normal",
  INSERT: "insert",
  VISUAL: "visual",
  VISUAL_LINE: "visualline",
  COMMAND: "command",
};

export class VimEngine {
  constructor(initialText, filename, callbacks = {}) {
    this.lines = initialText.split("\n");
    if (this.lines.length === 0) this.lines = [""];
    this.filename = filename;
    this.cursor = { row: 0, col: 0 };
    this.mode = MODE.NORMAL;
    this.visualAnchor = null;
    this.pendingCount = "";
    this.pendingOperator = null;
    this.opCount = 1;
    this.pendingPrefix = null; // 'g' awaiting second key, or 'f'/'r' awaiting char, or 'i'/'a' text-object prefix
    this.pendingPrefixCount = 1; // count captured before 'f'/'r'/'g' was pressed, for once the prefix resolves
    this.register = { text: "", linewise: false };
    this.cmdlineMode = null; // 'command' | 'search'
    this.cmdline = "";
    this.searchTerm = "";
    this.searchDir = 1;
    this.undoStack = [];
    this.redoStack = [];
    this.keystrokes = 0;
    // Monotonic count of real edits made this session — unlike undoStack
    // depth, undo/redo never decreases it. Lets a task check "an edit
    // happened at some point and the buffer is back to its seed state"
    // (the undo task) without that being indistinguishable from "nothing
    // was ever touched." See docs/adr/0004-task-validation.md.
    this.editCount = 0;
    // Same idea as editCount, but for Ctrl-r specifically — lets a task
    // check "a redo actually happened" (as opposed to e.g. just pressing
    // dd again, which can land on the same final buffer state without
    // ever touching redo).
    this.redoCount = 0;
    this.modified = false;
    this.savedOnce = false;
    this.message = "";
    this.lastVisualRange = null; // {startRow, endRow} used by '<,'>-prefixed ex commands
    this.onSave = callbacks.onSave || (() => {});
    this.onQuit = callbacks.onQuit || (() => {});
  }

  // ---------- public API ----------

  getState() {
    return {
      lines: this.lines.slice(),
      cursor: { ...this.cursor },
      mode: this.mode,
      keystrokes: this.keystrokes,
      editCount: this.editCount,
      redoCount: this.redoCount,
      register: { ...this.register },
      filename: this.filename,
      modified: this.modified,
      savedOnce: this.savedOnce,
      message: this.message,
      cmdlineMode: this.cmdlineMode,
      cmdline: this.cmdline,
      visualAnchor: this.visualAnchor ? { ...this.visualAnchor } : null,
    };
  }

  // Sets the starting cursor position for a task (see tasks.js) — not a
  // user edit, so deliberately outside handleKey()/undo bookkeeping.
  setCursor(row, col) {
    this.cursor = { row: clamp(row, 0, this.lines.length - 1), col: 0 };
    this.cursor.col = clamp(col, 0, Math.max(0, this._line().length - 1));
  }

  handleKey(key) {
    this.keystrokes++;
    this.message = "";
    if (this.mode === MODE.INSERT) return this._handleInsert(key);
    if (this.mode === MODE.COMMAND) return this._handleCmdline(key);
    if (this.mode === MODE.VISUAL || this.mode === MODE.VISUAL_LINE) return this._handleVisual(key);
    return this._handleNormal(key);
  }

  // ---------- undo ----------

  _snapshot() {
    this.undoStack.push({
      lines: this.lines.slice(),
      cursor: { ...this.cursor },
    });
    this.redoStack = [];
    this.modified = true;
    this.editCount++;
    if (this.undoStack.length > 200) this.undoStack.shift();
  }

  _undo() {
    const snap = this.undoStack.pop();
    if (!snap) {
      this.message = "Already at oldest change";
      return;
    }
    this.redoStack.push({ lines: this.lines.slice(), cursor: { ...this.cursor } });
    this.lines = snap.lines;
    this.cursor = snap.cursor;
    this._clampCursor();
  }

  _redo() {
    const snap = this.redoStack.pop();
    if (!snap) {
      this.message = "Already at newest change";
      return;
    }
    this.redoCount++;
    this.undoStack.push({ lines: this.lines.slice(), cursor: { ...this.cursor } });
    this.lines = snap.lines;
    this.cursor = snap.cursor;
    this._clampCursor();
  }

  // ---------- cursor helpers ----------

  _line(row = this.cursor.row) {
    return this.lines[row] ?? "";
  }

  _clampCursor(insertContext = false) {
    this.cursor.row = clamp(this.cursor.row, 0, this.lines.length - 1);
    const maxCol = insertContext ? this._line().length : Math.max(0, this._line().length - 1);
    this.cursor.col = clamp(this.cursor.col, 0, maxCol);
  }

  // ---------- motions: return {row, col, linewise, inclusive} ----------

  _motion(key, count) {
    const { row, col } = this.cursor;
    const line = this._line(row);
    switch (key) {
      case "h":
        return { row, col: clamp(col - count, 0, Math.max(0, line.length - 1)) };
      case "l":
        return { row, col: clamp(col + count, 0, Math.max(0, line.length - 1)) };
      case "j": {
        const r = clamp(row + count, 0, this.lines.length - 1);
        return { row: r, col: clamp(col, 0, Math.max(0, this._line(r).length - 1)) };
      }
      case "k": {
        const r = clamp(row - count, 0, this.lines.length - 1);
        return { row: r, col: clamp(col, 0, Math.max(0, this._line(r).length - 1)) };
      }
      case "0":
        return { row, col: 0 };
      case "^": {
        const idx = line.search(/\S/);
        return { row, col: idx === -1 ? 0 : idx };
      }
      case "$":
        return { row, col: Math.max(0, line.length - 1), inclusive: true };
      case "w": {
        let pos = { row, col };
        for (let i = 0; i < count; i++) pos = wordForwardOnce(this.lines, pos.row, pos.col);
        return pos;
      }
      case "b": {
        let pos = { row, col };
        for (let i = 0; i < count; i++) pos = wordBackwardOnce(this.lines, pos.row, pos.col);
        return pos;
      }
      case "e": {
        let pos = { row, col };
        for (let i = 0; i < count; i++) pos = endOfWordOnce(this.lines, pos.row, pos.col);
        return { ...pos, inclusive: true };
      }
      case "gg":
        return { row: clamp(count - 1, 0, this.lines.length - 1), col: 0, linewise: true, toFirstNonBlank: true };
      case "G":
        return {
          row: this._lastCountExplicit ? clamp(count - 1, 0, this.lines.length - 1) : this.lines.length - 1,
          col: 0,
          linewise: true,
          toFirstNonBlank: true,
        };
      default:
        return null;
    }
  }

  _findCharForward(ch, count) {
    let row = this.cursor.row;
    let col = this.cursor.col;
    const line = this._line(row);
    for (let i = 0; i < count; i++) {
      const idx = line.indexOf(ch, col + 1);
      if (idx === -1) return null;
      col = idx;
    }
    return { row, col, inclusive: true };
  }

  // ---------- normal mode ----------

  _handleNormal(key) {
    // char-argument pending (f, r). The count (if any) was typed BEFORE
    // the 'f'/'r'/'g' key itself and stashed in pendingPrefixCount at
    // that point — real vim doesn't accept digits between e.g. 'f' and
    // its char argument, so this key is always the literal argument,
    // never more count digits.
    if (this.pendingPrefix === "f") {
      this.pendingPrefix = null;
      const count = this.pendingPrefixCount;
      const target = this._findCharForward(key, count);
      this._applyMotionOrOperator(target);
      return;
    }
    if (this.pendingPrefix === "r") {
      this.pendingPrefix = null;
      const count = this.pendingPrefixCount;
      const { row, col } = this.cursor;
      const line = this._line(row);
      if (key !== "Escape" && col + count <= line.length) {
        this._snapshot();
        this.lines[row] = line.slice(0, col) + key.repeat(count) + line.slice(col + count);
        this.cursor.col = col + count - 1;
      }
      return;
    }
    // text-object prefix pending (i, a) after an operator
    if (this.pendingPrefix === "i" || this.pendingPrefix === "a") {
      if (key === "w") {
        const around = this.pendingPrefix === "a";
        this.pendingPrefix = null;
        const { startCol, endCol } = wordObject(this.lines, this.cursor.row, this.cursor.col, around);
        this._applyOperatorRange(this.cursor.row, startCol, this.cursor.row, endCol, { inclusive: true });
      } else {
        this.pendingPrefix = null;
        this._cancelOperator();
      }
      return;
    }
    // 'g' prefix (only gg supported)
    if (this.pendingPrefix === "g") {
      this.pendingPrefix = null;
      if (key === "g") {
        const target = this._motion("gg", this.pendingPrefixCount);
        this._applyMotionOrOperator(target);
      } else {
        this._cancelOperator();
      }
      return;
    }

    // count accumulation
    if (/[0-9]/.test(key) && !(key === "0" && this.pendingCount === "")) {
      this.pendingCount += key;
      return;
    }

    const count = this._takeCount();

    // operator active: expect a motion, text object, or doubled operator letter
    if (this.pendingOperator) {
      if (key === this.pendingOperator) {
        // dd / yy / cc
        const total = this.opCount * count;
        this._applyLinewiseOperator(this.cursor.row, this.cursor.row + total - 1);
        return;
      }
      if (key === "i" || key === "a") {
        this.pendingPrefix = key;
        return;
      }
      if (key === "g") {
        this.pendingPrefix = "g";
        this.pendingPrefixCount = count * this.opCount;
        return;
      }
      if (key === "f") {
        this.pendingPrefix = "f";
        this.pendingPrefixCount = count * this.opCount;
        return;
      }
      // Real vim's one celebrated special case: `cw` (change-word) acts
      // like `ce` — up to the end of the word, not through the trailing
      // whitespace to the start of the next one — specifically so typing
      // a replacement after it doesn't mash into the following word with
      // no space between them. Only `c` gets this; `dw`/`yw` keep the
      // normal "through the whitespace" motion.
      const motionKey =
        this.pendingOperator === "c" && key === "w" && classify(this._line()[this.cursor.col]) !== "space"
          ? "e"
          : key;
      const motion = this._motion(motionKey, count * this.opCount);
      if (motion) {
        this._applyOperatorMotion(motion);
      } else {
        this._cancelOperator();
      }
      return;
    }

    switch (key) {
      case "h":
      case "l":
      case "j":
      case "k":
      case "0":
      case "^":
      case "$":
      case "w":
      case "b":
      case "e":
      case "G": {
        const target = this._motion(key, count);
        this._applyMotionOrOperator(target);
        return;
      }
      case "g":
        this.pendingPrefix = "g";
        this.pendingPrefixCount = count;
        return;
      case "f":
        this.pendingPrefix = "f";
        this.pendingPrefixCount = count;
        return;
      case "d":
      case "y":
      case "c":
        this.pendingOperator = key;
        this.opCount = count;
        return;
      case "x": {
        const line = this._line();
        if (line.length === 0) return;
        this._snapshot();
        const n = clamp(count, 1, line.length - this.cursor.col);
        this.register = { text: line.slice(this.cursor.col, this.cursor.col + n), linewise: false };
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + line.slice(this.cursor.col + n);
        this._clampCursor();
        return;
      }
      case "r":
        this.pendingPrefix = "r";
        this.pendingPrefixCount = count;
        return;
      case "p":
        this._paste(true);
        return;
      case "P":
        this._paste(false);
        return;
      case "o": {
        this._snapshot();
        this.lines.splice(this.cursor.row + 1, 0, "");
        this.cursor = { row: this.cursor.row + 1, col: 0 };
        this.mode = MODE.INSERT;
        return;
      }
      case "O": {
        this._snapshot();
        this.lines.splice(this.cursor.row, 0, "");
        this.cursor = { row: this.cursor.row, col: 0 };
        this.mode = MODE.INSERT;
        return;
      }
      case "i":
        this._snapshot();
        this.mode = MODE.INSERT;
        return;
      case "a": {
        this._snapshot();
        this.cursor.col = clamp(this.cursor.col + 1, 0, this._line().length);
        this.mode = MODE.INSERT;
        return;
      }
      case "I": {
        this._snapshot();
        const idx = this._line().search(/\S/);
        this.cursor.col = idx === -1 ? 0 : idx;
        this.mode = MODE.INSERT;
        return;
      }
      case "A": {
        this._snapshot();
        this.cursor.col = this._line().length;
        this.mode = MODE.INSERT;
        return;
      }
      case "u":
        this._undo();
        return;
      case "<C-r>":
        this._redo();
        return;
      case "v":
        this.mode = MODE.VISUAL;
        this.visualAnchor = { ...this.cursor };
        return;
      case "V":
        this.mode = MODE.VISUAL_LINE;
        this.visualAnchor = { ...this.cursor };
        return;
      case "/":
        this.cmdlineMode = "search";
        this.cmdline = "";
        this.mode = MODE.COMMAND;
        return;
      case "n":
        this._repeatSearch(this.searchDir);
        return;
      case "N":
        this._repeatSearch(-this.searchDir);
        return;
      case ":":
        this.cmdlineMode = "command";
        this.cmdline = "";
        this.mode = MODE.COMMAND;
        return;
      case "Escape":
        return;
      default:
        return;
    }
  }

  // `count` defaults to 1 when no digits were typed; `_lastCountExplicit`
  // records whether digits actually preceded this key — only `G` cares
  // (bare `G` goes to the last line, but `5G`/an explicit count goes to
  // that line, unlike every other motion where "no count" and "count 1"
  // behave the same).
  _takeCount() {
    const explicit = this.pendingCount !== "";
    const c = explicit ? parseInt(this.pendingCount, 10) : 1;
    this._lastCountExplicit = explicit;
    this.pendingCount = "";
    return c;
  }

  _cancelOperator() {
    this.pendingOperator = null;
    this.opCount = 1;
    this.pendingPrefix = null;
    this.pendingPrefixCount = 1;
  }

  // Used both for a bare motion key and for the tail end of a multi-key
  // motion (f{char}, gg) that may have been started while an operator
  // (d/y/c) was already pending — hence the pendingOperator branch here
  // instead of at each call site.
  _applyMotionOrOperator(target) {
    if (!target) {
      if (this.pendingOperator) this._cancelOperator();
      return;
    }
    let col = target.col;
    if (target.toFirstNonBlank) {
      const idx = this._line(target.row).search(/\S/);
      col = idx === -1 ? 0 : idx;
    }
    if (this.pendingOperator) {
      this._applyOperatorMotion({ ...target, col });
    } else {
      this.cursor = { row: target.row, col };
    }
  }

  // motion issued while an operator (d/y/c) is pending
  _applyOperatorMotion(motion) {
    if (motion.linewise) {
      this._applyLinewiseOperator(this.cursor.row, motion.row);
      return;
    }
    this._applyOperatorRange(this.cursor.row, this.cursor.col, motion.row, motion.col, {
      inclusive: !!motion.inclusive,
    });
  }

  _applyOperatorRange(startRow, startCol, endRow, endCol, { inclusive }) {
    const op = this.pendingOperator;
    this._cancelOperator();
    // normalize ordering (only same-row ranges are produced by current motion set)
    if (endRow < startRow || (endRow === startRow && endCol < startCol)) {
      [startRow, startCol, endRow, endCol] = [endRow, endCol, startRow, startCol];
    }
    if (startRow !== endRow) {
      // multi-line charwise range (from e.g. f-based motion across lines won't happen,
      // but keep this safe for future motions) — fall back to linewise for simplicity.
      this._applyLinewiseOperator(startRow, endRow);
      return;
    }
    const line = this._line(startRow);
    const endExclusive = inclusive ? endCol + 1 : endCol;
    const from = clamp(Math.min(startCol, endExclusive), 0, line.length);
    const to = clamp(Math.max(startCol, endExclusive), 0, line.length);
    const text = line.slice(from, to);
    if (op === "y") {
      this.register = { text, linewise: false };
      this.cursor = { row: startRow, col: from };
      return;
    }
    this._snapshot();
    this.register = { text, linewise: false };
    this.lines[startRow] = line.slice(0, from) + line.slice(to);
    this.cursor = { row: startRow, col: clamp(from, 0, Math.max(0, this.lines[startRow].length - 1)) };
    if (op === "c") this.mode = MODE.INSERT;
  }

  _applyLinewiseOperator(startRow, endRow) {
    const op = this.pendingOperator;
    this._cancelOperator();
    let a = clamp(Math.min(startRow, endRow), 0, this.lines.length - 1);
    let b = clamp(Math.max(startRow, endRow), 0, this.lines.length - 1);
    const text = this.lines.slice(a, b + 1).join("\n");
    if (op === "y") {
      this.register = { text, linewise: true };
      this.cursor = { row: a, col: 0 };
      return;
    }
    this._snapshot();
    this.register = { text, linewise: true };
    this.lines.splice(a, b - a + 1);
    if (op === "c") {
      this.lines.splice(a, 0, "");
      this.cursor = { row: a, col: 0 };
      this.mode = MODE.INSERT;
      return;
    }
    if (this.lines.length === 0) this.lines = [""];
    this.cursor = { row: clamp(a, 0, this.lines.length - 1), col: 0 };
    this._clampCursor();
  }

  _paste(after) {
    if (!this.register.text) return;
    this._snapshot();
    if (this.register.linewise) {
      const rows = this.register.text.split("\n");
      const at = after ? this.cursor.row + 1 : this.cursor.row;
      this.lines.splice(at, 0, ...rows);
      this.cursor = { row: at, col: 0 };
    } else {
      const line = this._line();
      const at = after ? clamp(this.cursor.col + 1, 0, line.length) : this.cursor.col;
      this.lines[this.cursor.row] = line.slice(0, at) + this.register.text + line.slice(at);
      this.cursor = { row: this.cursor.row, col: at + this.register.text.length - 1 };
      this._clampCursor();
    }
  }

  // ---------- insert mode ----------

  _handleInsert(key) {
    if (key === "Escape") {
      this.mode = MODE.NORMAL;
      this.cursor.col = clamp(this.cursor.col - 1, 0, Math.max(0, this._line().length - 1));
      return;
    }
    if (key === "Enter") {
      const line = this._line();
      const before = line.slice(0, this.cursor.col);
      const after = line.slice(this.cursor.col);
      this.lines.splice(this.cursor.row, 1, before, after);
      this.cursor = { row: this.cursor.row + 1, col: 0 };
      return;
    }
    if (key === "Backspace") {
      if (this.cursor.col > 0) {
        const line = this._line();
        this.lines[this.cursor.row] = line.slice(0, this.cursor.col - 1) + line.slice(this.cursor.col);
        this.cursor.col--;
      } else if (this.cursor.row > 0) {
        const prevLen = this._line(this.cursor.row - 1).length;
        this.lines[this.cursor.row - 1] += this._line();
        this.lines.splice(this.cursor.row, 1);
        this.cursor = { row: this.cursor.row - 1, col: prevLen };
      }
      return;
    }
    if (key.length === 1) {
      const line = this._line();
      this.lines[this.cursor.row] = line.slice(0, this.cursor.col) + key + line.slice(this.cursor.col);
      this.cursor.col++;
      this.modified = true;
    }
  }

  // ---------- visual mode ----------

  _handleVisual(key) {
    if (this.pendingPrefix === "g") {
      this.pendingPrefix = null;
      if (key === "g") this.cursor = { row: 0, col: 0 };
      return;
    }
    if (/[0-9]/.test(key) && !(key === "0" && this.pendingCount === "")) {
      this.pendingCount += key;
      return;
    }
    const count = this._takeCount();
    if (key === "g") {
      this.pendingPrefix = "g";
      return;
    }
    if (["h", "l", "j", "k", "0", "^", "$", "w", "b", "e"].includes(key)) {
      const target = this._motion(key, count);
      if (target) this.cursor = { row: target.row, col: target.col };
      return;
    }
    if (key === "G") {
      this.cursor = { row: this.lines.length - 1, col: 0 };
      return;
    }
    if (key === "Escape") {
      this.mode = MODE.NORMAL;
      this.visualAnchor = null;
      return;
    }
    if (key === "d" || key === "x" || key === "y") {
      this._applyVisualEdit(key === "y" ? "y" : "d");
      return;
    }
    if (key === ":") {
      this.lastVisualRange = this._visualRowRange();
      this.mode = MODE.COMMAND;
      this.cmdlineMode = "command";
      this.cmdline = "'<,'>";
      return;
    }
  }

  _visualRowRange() {
    const a = Math.min(this.cursor.row, this.visualAnchor.row);
    const b = Math.max(this.cursor.row, this.visualAnchor.row);
    return { startRow: a, endRow: b };
  }

  _applyVisualEdit(op) {
    const linewise = this.mode === MODE.VISUAL_LINE;
    if (linewise) {
      const { startRow, endRow } = this._visualRowRange();
      this.pendingOperator = op;
      this.mode = MODE.NORMAL;
      this.visualAnchor = null;
      this._applyLinewiseOperator(startRow, endRow);
      return;
    }
    let a = this.cursor;
    let b = this.visualAnchor;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
    this.pendingOperator = op;
    this.mode = MODE.NORMAL;
    this.visualAnchor = null;
    this._applyOperatorRange(a.row, a.col, b.row, b.col, { inclusive: true });
  }

  // ---------- command-line / search ----------

  _handleCmdline(key) {
    if (key === "Escape") {
      this.mode = MODE.NORMAL;
      this.cmdlineMode = null;
      this.cmdline = "";
      return;
    }
    if (key === "Backspace") {
      if (this.cmdline.length === 0) {
        this.mode = MODE.NORMAL;
        this.cmdlineMode = null;
        return;
      }
      this.cmdline = this.cmdline.slice(0, -1);
      return;
    }
    if (key === "Enter") {
      const cmd = this.cmdline;
      const mode = this.cmdlineMode;
      this.mode = MODE.NORMAL;
      this.cmdlineMode = null;
      this.cmdline = "";
      if (mode === "search") this._runSearch(cmd);
      else this._runExCommand(cmd);
      return;
    }
    if (key.length === 1) this.cmdline += key;
  }

  _runSearch(term) {
    if (!term) return;
    this.searchTerm = term;
    this.searchDir = 1;
    this._repeatSearch(1);
  }

  _repeatSearch(dir) {
    if (!this.searchTerm) return;
    const total = this.lines.length;
    const { row: r0, col: c0 } = this.cursor;
    // same line first, starting just past (or before) the cursor, then wrap
    // through the rest of the buffer from the following/preceding line.
    const sameLineIdx =
      dir === 1
        ? this.lines[r0].indexOf(this.searchTerm, c0 + 1)
        : c0 === 0
          ? -1
          : this.lines[r0].lastIndexOf(this.searchTerm, c0 - 1);
    if (sameLineIdx !== -1) {
      this.cursor = { row: r0, col: sameLineIdx };
      return;
    }
    for (let step = 1; step <= total; step++) {
      const row = ((r0 + dir * step) % total + total) % total;
      const line = this.lines[row];
      const idx = dir === 1 ? line.indexOf(this.searchTerm) : line.lastIndexOf(this.searchTerm);
      if (idx !== -1) {
        this.cursor = { row, col: idx };
        return;
      }
    }
    this.message = `E486: Pattern not found: ${this.searchTerm}`;
  }

  _runExCommand(raw) {
    const cmd = raw.trim();
    if (cmd === "w") {
      this.savedOnce = true;
      this.modified = false;
      this.onSave(this.lines.join("\n"));
      this.message = `"${this.filename}" written`;
      return;
    }
    if (cmd === "q" || cmd === "q!") {
      this.onQuit();
      return;
    }
    if (cmd === "wq" || cmd === "x") {
      this.savedOnce = true;
      this.modified = false;
      this.onSave(this.lines.join("\n"));
      this.onQuit();
      return;
    }
    if (/^\d+$/.test(cmd)) {
      this.cursor = { row: clamp(parseInt(cmd, 10) - 1, 0, this.lines.length - 1), col: 0 };
      return;
    }
    if (cmd === "sort") {
      this._snapshot();
      this.lines.sort((a, b) => a.localeCompare(b));
      return;
    }
    if (cmd === "'<,'>sort") {
      const range = this.lastVisualRange;
      if (!range) {
        this.message = "E20: Mark not set";
        return;
      }
      this._snapshot();
      const slice = this.lines.slice(range.startRow, range.endRow + 1).sort((a, b) => a.localeCompare(b));
      this.lines.splice(range.startRow, slice.length, ...slice);
      return;
    }
    let m = cmd.match(/^s\/(.*)\/(.*)\/(g)?$/);
    if (m) {
      this._snapshot();
      const [, pattern, replacement, g] = m;
      const re = new RegExp(pattern, g ? "g" : "");
      this.lines[this.cursor.row] = this._line().replace(re, replacement);
      return;
    }
    m = cmd.match(/^%s\/(.*)\/(.*)\/(g)?$/);
    if (m) {
      this._snapshot();
      const [, pattern, replacement, g] = m;
      const re = new RegExp(pattern, g ? "g" : "");
      this.lines = this.lines.map((l) => l.replace(re, replacement));
      return;
    }
    this.message = `E492: Not an editor command: ${cmd}`;
  }
}

export { MODE };
