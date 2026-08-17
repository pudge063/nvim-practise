// DOM layer: shell view + vim view rendering, keyboard capture.
// vim.js knows nothing about the DOM; this is the only module that
// translates browser KeyboardEvents into the key vocabulary vim.js expects
// and turns VimEngine.getState() into pixels.
import { runCommand, COMMAND_NAMES } from "./shell.js";
import { VimEngine, MODE } from "./vim.js";

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function longestCommonPrefix(strs) {
  let prefix = strs[0];
  for (const s of strs.slice(1)) {
    while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

function randHex() {
  return Math.floor(Math.random() * 0xffffffff)
    .toString(16)
    .padStart(8, "0");
}

const MODE_LABEL = {
  [MODE.NORMAL]: "NORMAL",
  [MODE.INSERT]: "INSERT",
  [MODE.VISUAL]: "VISUAL",
  [MODE.VISUAL_LINE]: "V-LINE",
  [MODE.COMMAND]: "COMMAND",
};

export class Terminal {
  constructor({ fs, els, onVimKeystroke }) {
    this.fs = fs;
    this.els = els;
    this.onVimKeystroke = onVimKeystroke || (() => {});
    this.history = [];
    this.historyIndex = 0;
    this.engine = null;
    this.vimPath = null;

    this._printLine("Welcome to vimquest. Type help for a list of commands.", "line-hint");
    this._updatePrompt();
    this.els.shellInput.addEventListener("keydown", (e) => this._onShellKeydown(e));
    this.els.vimView.addEventListener("keydown", (e) => this._onVimKeydown(e));
    this.els.terminalPane.addEventListener("click", () => this._focusActive());
    this.els.vimHintClose?.addEventListener("click", () => this.hideInlineHint());
    this._focusActive();
  }

  // Contextual "you look stuck" popup shown inside the vim view itself
  // (as opposed to the always-available manual hint button in the tasks
  // panel) — see tasks.js's _maybeShowInlineHint for the trigger
  // condition (2+ keystrokes past a task's par, re-shown periodically).
  showInlineHint(html) {
    if (!this.els.vimHintPopup) return;
    this.els.vimHintText.innerHTML = html;
    this.els.vimHintPopup.classList.remove("hidden");
    clearTimeout(this._hintTimeout);
    this._hintTimeout = setTimeout(() => this.hideInlineHint(), 8000);
  }

  hideInlineHint() {
    this.els.vimHintPopup?.classList.add("hidden");
    clearTimeout(this._hintTimeout);
  }

  _focusActive() {
    if (this.els.vimView.classList.contains("hidden")) {
      this.els.shellInput.focus();
    } else {
      this.els.vimView.focus();
    }
  }

  // ---------- shell ----------

  _updatePrompt() {
    this.els.promptText.textContent = `user@vimquest:${this.fs.displayPath()}$`;
    this.els.windowTitle.textContent = `bash — ${this.fs.displayPath()}`;
  }

  _printLine(text, cls = "") {
    const div = document.createElement("div");
    div.className = "line " + cls;
    div.textContent = text;
    this.els.terminalOutput.appendChild(div);
    // Caps DOM growth during the (deliberately never-ending) meltdown
    // easter egg — normal usage never gets close to this many lines.
    while (this.els.terminalOutput.childElementCount > 400) {
      this.els.terminalOutput.removeChild(this.els.terminalOutput.firstChild);
    }
    this.els.terminalOutput.scrollTop = this.els.terminalOutput.scrollHeight;
  }

  _printCommandEcho(cmd) {
    const div = document.createElement("div");
    div.className = "line line-cmd";
    const promptSpan = document.createElement("span");
    promptSpan.className = "cmd-prompt";
    promptSpan.textContent = `user@vimquest:${this.fs.displayPath()}$`;
    div.appendChild(promptSpan);
    div.appendChild(document.createTextNode(cmd));
    this.els.terminalOutput.appendChild(div);
    this.els.terminalOutput.scrollTop = this.els.terminalOutput.scrollHeight;
  }

  _onShellKeydown(e) {
    if (e.key === "Enter") {
      const cmd = this.els.shellInput.value;
      this.els.shellInput.value = "";
      this._printCommandEcho(cmd);
      if (cmd.trim()) {
        this.history.push(cmd);
        this.historyIndex = this.history.length;
      }
      const result = runCommand(this.fs, cmd);
      if (result.action?.type === "clear") {
        this.els.terminalOutput.innerHTML = "";
      } else {
        for (const l of result.lines) this._printLine(l.text, l.cls);
      }
      this._updatePrompt();
      if (result.action?.type === "vim") {
        this.enterVim(result.action.path);
      }
      if (result.action?.type === "meltdown") {
        this._startMeltdown();
      }
      if (result.action?.type === "meltdown-image") {
        this._startMeltdown({ skipErrors: true });
      }
      if (result.action?.type === "reboot") {
        setTimeout(() => window.location.reload(), 500);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (this.historyIndex > 0) this.historyIndex--;
      this.els.shellInput.value = this.history[this.historyIndex] ?? "";
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (this.historyIndex < this.history.length) this.historyIndex++;
      this.els.shellInput.value = this.history[this.historyIndex] ?? "";
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault(); // never let Tab move focus away — real terminals complete instead
      this._completeShellInput();
      return;
    }
  }

  // Real-terminal-style completion: first word completes against known
  // commands, anything after completes against files/dirs in the target
  // directory. One match completes it outright; several complete to their
  // longest common prefix and, if that doesn't advance anything, print
  // the candidate list (bash's classic double-Tab behavior, collapsed to
  // a single Tab here since there's no separate "did nothing" signal to
  // wait on).
  _completeShellInput() {
    const value = this.els.shellInput.value;
    const parts = value.split(" ");
    const partial = parts[parts.length - 1];
    const isCommandPos = parts.length === 1;

    let candidates;
    if (isCommandPos) {
      candidates = COMMAND_NAMES.filter((c) => c.startsWith(partial));
    } else {
      const slash = partial.lastIndexOf("/");
      const dirPath = slash === -1 ? this.fs.cwd : partial.slice(0, slash) || "/";
      const namePartial = slash === -1 ? partial : partial.slice(slash + 1);
      const prefix = slash === -1 ? "" : partial.slice(0, slash + 1);
      let entries;
      try {
        entries = this.fs.list(dirPath);
      } catch {
        entries = [];
      }
      candidates = entries
        .filter((entry) => entry.name.startsWith(namePartial))
        .map((entry) => prefix + entry.name + (entry.type === "dir" ? "/" : ""));
    }

    if (candidates.length === 0) return;
    if (candidates.length === 1) {
      parts[parts.length - 1] = candidates[0];
      this.els.shellInput.value = parts.join(" ") + (isCommandPos ? " " : "");
      return;
    }
    const lcp = longestCommonPrefix(candidates);
    if (lcp.length > partial.length) {
      parts[parts.length - 1] = lcp;
      this.els.shellInput.value = parts.join(" ");
      return;
    }
    this._printCommandEcho(value);
    this._printLine(candidates.join("  "), "line-dir");
  }

  // `rm -rf /` and `sudo` easter egg (see shell.js's looksLikeRmRfRoot /
  // the sudo branch). `rm -rf /` gets a 2s spray of fake fatal errors
  // first (shake + red glow on the terminal pane) before the picture;
  // `sudo` (skipErrors) cuts straight to it. Either way it ends the same:
  // the picture, then an automatic reload — nothing here is meant to be
  // dismissed or recovered from gracefully, the reload IS the recovery.
  _startMeltdown({ skipErrors = false } = {}) {
    if (this._meltdownInterval || this._meltdownImageShown) return;
    this.els.shellInput.disabled = true;
    this.els.terminalPane.classList.add("meltdown");

    if (skipErrors) {
      this._showMeltdownImage();
      return;
    }

    const devices = ["/dev/sda1", "/dev/nvme0n1", "/dev/loop0", "/dev/zram0", "/dev/null"];
    const messages = [
      () => `kernel panic: not syncing — VFS: unable to mount root fs on ${pick(devices)}`,
      () => `rm: cannot remove '${pick(devices)}': Device or resource busy`,
      () => `Segmentation fault (core dumped) at 0x${randHex()}`,
      () => `[${(performance.now() / 1000).toFixed(3)}] EXT4-fs error (device ${pick(devices)}): journal has aborted`,
      () => `bash: /bin/bash: cannot execute binary file`,
      () => `rm: it's dangerous to go alone — take this: 🗡️`,
      () => `Watchdog CPU:${Math.floor(Math.random() * 8)}: hung task, blocked for more than 120 seconds`,
      () => `vimquest: filesystem irrecoverably gone.`,
    ];
    this._meltdownInterval = setInterval(() => {
      this._printLine(messages[Math.floor(Math.random() * messages.length)](), "line-error line-meltdown");
    }, 140);
    setTimeout(() => this._showMeltdownImage(), 2000);
  }

  _showMeltdownImage() {
    if (this._meltdownImageShown) return;
    this._meltdownImageShown = true;
    clearInterval(this._meltdownInterval);
    this.els.meltdownOverlay?.classList.remove("hidden");
    setTimeout(() => window.location.reload(), 3000);
  }

  // ---------- vim ----------

  // opts: { cursor: {row, col} } — used by tasks.js to start a task with
  // the cursor somewhere other than the top of the file.
  enterVim(path, opts = {}) {
    this.hideInlineHint();
    const content = this.fs.exists(path) ? this.fs.read(path) : "";
    if (!this.fs.exists(path)) this.fs.touch(path);
    this.vimPath = path;
    this.engine = new VimEngine(content, path.split("/").pop(), {
      onSave: (text) => {
        this.fs.write(path, text);
      },
      onQuit: () => this.exitVim(),
    });
    if (opts.cursor) this.engine.setCursor(opts.cursor.row, opts.cursor.col);

    this.els.shellView.classList.add("hidden");
    this.els.vimView.classList.remove("hidden");
    this.els.windowTitle.textContent = `vim — ${this.fs.displayPath(path)}`;
    this._renderVim();
    this.els.vimView.focus();
  }

  exitVim() {
    this.hideInlineHint();
    this.engine = null;
    this.vimPath = null;
    this.els.vimView.classList.add("hidden");
    this.els.shellView.classList.remove("hidden");
    this._updatePrompt();
    this.els.shellInput.focus();
  }

  _onVimKeydown(e) {
    if (!this.engine) return;
    const key = this._translateKey(e);
    if (key === null) return; // key we don't handle — let the browser do its default thing
    e.preventDefault();
    const engine = this.engine;
    engine.handleKey(key);
    // :q (via onQuit -> exitVim()) may have already torn this.engine down
    // synchronously inside handleKey() above — nothing left to render or
    // report a keystroke against in that case.
    if (!this.engine) return;
    this._renderVim();
    this.onVimKeystroke(engine.getState());
  }

  _translateKey(e) {
    if (e.ctrlKey && e.key.toLowerCase() === "r") return "<C-r>";
    if (e.ctrlKey || e.metaKey || e.altKey) return null;
    if (e.key === "Escape") return "Escape";
    if (e.key === "Enter") return "Enter";
    if (e.key === "Backspace") return "Backspace";
    if (e.key === "Tab") return null;
    if (e.key.length === 1) return e.key;
    return null;
  }

  _renderVim() {
    const state = this.engine.getState();
    const buf = this.els.vimBuffer;
    buf.innerHTML = "";

    const selRange = this._selectionRange(state);

    state.lines.forEach((lineText, row) => {
      const lineEl = document.createElement("div");
      lineEl.className = "vim-line" + (row === state.cursor.row ? " vim-line-active" : "");

      const lnum = document.createElement("span");
      lnum.className = "vim-lnum";
      lnum.textContent = String(row + 1);
      lineEl.appendChild(lnum);

      const textEl = document.createElement("span");
      textEl.className = "vim-text";

      const display = lineText.length === 0 ? " " : lineText;
      for (let col = 0; col < display.length; col++) {
        const ch = document.createElement("span");
        ch.className = "vim-char";
        const isCursor = row === state.cursor.row && col === state.cursor.col && lineText.length > 0;
        if (isCursor) ch.classList.add("vim-cursor");
        else if (this._inSelection(selRange, row, col)) ch.classList.add("vim-selected");
        ch.textContent = display[col];
        textEl.appendChild(ch);
      }
      if (
        lineText.length === 0 &&
        row === state.cursor.row &&
        (state.mode === MODE.NORMAL || state.mode === MODE.VISUAL || state.mode === MODE.VISUAL_LINE)
      ) {
        textEl.firstChild.classList.add("vim-cursor");
      }
      lineEl.appendChild(textEl);
      buf.appendChild(lineEl);
    });

    const activeLine = buf.children[state.cursor.row];
    if (activeLine) activeLine.scrollIntoView({ block: "nearest" });

    // status line
    this.els.vimModeIndicator.textContent = MODE_LABEL[state.mode] ?? state.mode;
    this.els.vimFilename.textContent = state.filename + (state.modified ? " [+]" : "");
    this.els.vimKeycount.textContent = state.message
      ? state.message
      : `${state.keystrokes} ${state.keystrokes === 1 ? "keystroke" : "keystrokes"}`;
    this.els.vimPosition.textContent = `${state.cursor.row + 1},${state.cursor.col + 1}`;

    this.els.vimView.className = "vim-view mode-" + state.mode;

    if (state.mode === MODE.COMMAND) {
      this.els.vimCmdline.classList.remove("hidden");
      this.els.vimCmdlinePrefix.textContent = state.cmdlineMode === "search" ? "/" : ":";
      this.els.vimCmdlineText.textContent = state.cmdline;
    } else {
      this.els.vimCmdline.classList.add("hidden");
    }
  }

  _selectionRange(state) {
    if (state.mode !== MODE.VISUAL && state.mode !== MODE.VISUAL_LINE) return null;
    if (!state.visualAnchor) return null;
    let a = state.visualAnchor;
    let b = state.cursor;
    if (b.row < a.row || (b.row === a.row && b.col < a.col)) [a, b] = [b, a];
    return { a, b, linewise: state.mode === MODE.VISUAL_LINE };
  }

  _inSelection(sel, row, col) {
    if (!sel) return false;
    if (row < sel.a.row || row > sel.b.row) return false;
    if (sel.linewise) return true;
    if (sel.a.row === sel.b.row) return col >= sel.a.col && col <= sel.b.col;
    if (row === sel.a.row) return col >= sel.a.col;
    if (row === sel.b.row) return col <= sel.b.col;
    return true;
  }
}

