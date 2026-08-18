// DOM layer: shell view + vim view rendering, keyboard capture.
// vim.js knows nothing about the DOM; this is the only module that
// translates browser KeyboardEvents into the key vocabulary vim.js expects
// and turns VimEngine.getState() into pixels.
import { runCommand, COMMAND_NAMES, renderTopSnapshot } from "./shell.js";
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

// ---------- shutdown / reboot / boot log lines ----------
// See the "shutdown / reboot / power" section further down for how
// each of these is actually played.

const SHUTDOWN_LOG_LINES = [
  "Stopping user manager for UID 1000...",
  "Stopping Session c1 of user user...",
  "[  OK  ] Stopped target Multi-User System.",
  "[  OK  ] Stopped target Graphical Interface.",
  "[  OK  ] Reached target Shutdown.",
  "[  OK  ] Reached target Final Step.",
  " Starting Power-Off...",
  "[  OK  ] Finished Power-Off.",
  "systemd-shutdown[1]: Powering off.",
  "reboot: Power down",
];

const REBOOT_LOG_LINES = [
  "Stopping user manager for UID 1000...",
  "Stopping Session c1 of user user...",
  "[  OK  ] Stopped target Multi-User System.",
  "[  OK  ] Stopped target Graphical Interface.",
  "[  OK  ] Reached target Shutdown.",
  "[  OK  ] Reached target Reboot.",
  " Rebooting...",
  "systemd-shutdown[1]: Rebooting.",
];

const BOOT_LOG_LINES = [
  "Booting vimlab...",
  "[  OK  ] Started Journal Service.",
  "[  OK  ] Mounted /home.",
  "[  OK  ] Started Network Manager.",
  "[  OK  ] Started D-Bus System Message Bus.",
  "[  OK  ] Reached target Multi-User System.",
  "",
  "vimlab login: user (automatic login)",
];

export class Terminal {
  constructor({ fs, els, onVimKeystroke, onShellCommand, onVimExit }) {
    this.fs = fs;
    this.els = els;
    this.onVimKeystroke = onVimKeystroke || (() => {});
    this.onShellCommand = onShellCommand || (() => {});
    this.onVimExit = onVimExit || (() => {});
    this.history = [];
    this.historyIndex = 0;
    this.engine = null;
    this.vimPath = null;

    // Preloaded once at startup and reused (currentTime reset + replay)
    // rather than `new Audio()` at trigger time — on some platforms
    // (reported on macOS) the very first decode of a never-touched audio
    // file is slow enough that the picture visibly appears before the
    // flashbang sound starts. Loading (not playing) up front needs no
    // user gesture, so this is safe to do immediately on construction.
    this._flashbangAudio = new Audio("img/flashbang.mp3");
    this._flashbangAudio.preload = "auto";
    this._flashbangAudio.volume = 1.0;
    this._impactAudio = new Audio("img/pum-impacto.mp3");
    this._impactAudio.preload = "auto";

    this.els.shellInput.addEventListener("keydown", (e) => this._onShellKeydown(e));
    this.els.vimView.addEventListener("keydown", (e) => this._onVimKeydown(e));
    this.els.terminalOutput.addEventListener("keydown", (e) => this._onTopKeydown(e));
    this.els.terminalPane.addEventListener("click", () => this._focusActive());
    this.els.vimHintClose?.addEventListener("click", () => this.hideInlineHint());
    this.els.shellHintClose?.addEventListener("click", () => this.hideShellHint());
    this.els.powerBtn?.addEventListener("click", () => this._powerOn());

    // Every page load — first visit, refresh, or the reload `reboot`
    // itself triggers — plays the boot log before the terminal becomes
    // usable, same as a real machine actually booting rather than just
    // materializing a shell.
    this.els.shellInput.disabled = true;
    this._runLogLines(BOOT_LOG_LINES, () => {
      this.els.shellInput.disabled = false;
      this._printLine("Welcome to vimlab. Type help for a list of commands.", "line-hint");
      this._updatePrompt();
      this._focusActive();
    });
  }

  // Contextual popup shown inside the vim view itself. Two callers, two
  // lifetimes: tasks.js's "you look stuck" nudge (auto-hides after 8s,
  // the default) and tutorial.js's step coaching (persistent — stays up
  // until the step is actually done, since it's not a nudge, it's the
  // instruction).
  showInlineHint(html, { persistent = false } = {}) {
    if (!this.els.vimHintPopup) return;
    this.els.vimHintText.innerHTML = html;
    this.els.vimHintPopup.classList.remove("hidden");
    clearTimeout(this._hintTimeout);
    if (!persistent) this._hintTimeout = setTimeout(() => this.hideInlineHint(), 8000);
  }

  hideInlineHint() {
    this.els.vimHintPopup?.classList.add("hidden");
    clearTimeout(this._hintTimeout);
  }

  // Same idea, for the shell view — used by tutorial.js's first step
  // ("open vim") since that happens before any vim engine exists.
  showShellHint(html, { persistent = false } = {}) {
    if (!this.els.shellHintPopup) return;
    this.els.shellHintText.innerHTML = html;
    this.els.shellHintPopup.classList.remove("hidden");
    clearTimeout(this._shellHintTimeout);
    if (!persistent) this._shellHintTimeout = setTimeout(() => this.hideShellHint(), 8000);
  }

  hideShellHint() {
    this.els.shellHintPopup?.classList.add("hidden");
    clearTimeout(this._shellHintTimeout);
  }

  _focusActive() {
    if (this._poweredOff) {
      return; // nothing to focus — the power button is the only live control
    } else if (this._topInterval) {
      this.els.terminalOutput.focus();
    } else if (this.els.vimView.classList.contains("hidden")) {
      this.els.shellInput.focus();
    } else {
      this.els.vimView.focus();
    }
  }

  // ---------- shell ----------

  _updatePrompt() {
    this.els.promptText.textContent = `user@vimlab:${this.fs.displayPath()}$`;
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
    promptSpan.textContent = `user@vimlab:${this.fs.displayPath()}$`;
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
      const result = runCommand(this.fs, cmd, { history: this.history });
      if (result.action?.type === "clear") {
        this.els.terminalOutput.innerHTML = "";
      } else {
        for (const l of result.lines) this._printLine(l.text, l.cls);
      }
      this._updatePrompt();
      if (result.action?.type === "vim") {
        this.enterVim(result.action.path);
      }
      if (result.action?.type === "browse") {
        this.enterBrowser(result.action.path);
      }
      if (result.action?.type === "top") {
        this.enterTop();
      }
      if (result.action?.type === "meltdown") {
        this._startMeltdown();
      }
      if (result.action?.type === "meltdown-image") {
        this._startMeltdown({ skipErrors: true });
      }
      if (result.action?.type === "reboot") {
        this._startReboot();
      }
      if (result.action?.type === "shutdown") {
        this._startShutdown(result.action.delaySec);
      }
      // Fired last, once any of the branches above (e.g. enterVim) have
      // already run — a listener reacting to "vim was opened" needs
      // `this.engine` to actually exist by the time it's notified.
      this.onShellCommand(cmd, result);
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
  // the sudo branch). `rm -rf /` gets a 1s spray of fake fatal errors
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
      () => `vimlab: filesystem irrecoverably gone.`,
    ];
    this._meltdownInterval = setInterval(() => {
      this._printLine(messages[Math.floor(Math.random() * messages.length)](), "line-error line-meltdown");
    }, 140);
    setTimeout(() => this._showMeltdownImage(), 1000);
  }

  _playSound(audio) {
    // Best-effort: browsers that block unprompted audio (rare, given the
    // user already typed a command to get here) just get it silent —
    // never let this throw and skip the reload below.
    try {
      audio.currentTime = 0;
      audio.play().catch(() => {});
    } catch {
      /* ignore */
    }
  }

  _showMeltdownImage() {
    if (this._meltdownImageShown) return;
    this._meltdownImageShown = true;
    clearInterval(this._meltdownInterval);
    this.els.meltdownOverlay?.classList.remove("hidden");
    this._playSound(this._flashbangAudio);
    // The picture itself is essentially fully visible by ~0.3s (see
    // .meltdown-overlay img's fx-img-reveal) — the impact hit lands
    // right there, not after the flash sound has mostly finished.
    setTimeout(() => this._playSound(this._impactAudio), 150);
    setTimeout(() => window.location.reload(), 1000);
  }

  // `top` — a live-updating view that takes over the terminal display
  // (like a real full-screen curses app using the alternate screen
  // buffer), refreshing on an interval with freshly-rolled fake stats.
  // The previous scrollback is saved and restored verbatim on `q`, so
  // quitting genuinely "clears top's output" rather than leaving it
  // behind in the scrollback — same as a real terminal.
  enterTop() {
    if (this._topInterval) return;
    this.hideInlineHint();
    this.hideShellHint();
    this._topSavedOutput = this.els.terminalOutput.innerHTML;
    this.els.shellInput.disabled = true;
    this._renderTop();
    this._topInterval = setInterval(() => this._renderTop(), 1500);
    this.els.terminalOutput.focus();
  }

  _renderTop() {
    const pre = document.createElement("pre");
    pre.className = "top-live";
    pre.textContent = renderTopSnapshot().join("\n");
    this.els.terminalOutput.innerHTML = "";
    this.els.terminalOutput.appendChild(pre);
  }

  exitTop() {
    clearInterval(this._topInterval);
    this._topInterval = null;
    this.els.terminalOutput.innerHTML = this._topSavedOutput ?? "";
    this._topSavedOutput = null;
    this.els.shellInput.disabled = false;
    this.els.terminalOutput.scrollTop = this.els.terminalOutput.scrollHeight;
    this._focusActive();
  }

  _onTopKeydown(e) {
    if (!this._topInterval) return;
    if (e.key === "q") {
      e.preventDefault();
      this.exitTop();
    }
  }

  // ---------- shutdown / reboot / power ----------
  //
  // `shutdown` (see shell.js) schedules this after its own delay, then a
  // shutdown log plays and the terminal "powers off": a black overlay
  // with just a power button, scoped to the terminal window itself, not
  // the whole page (unlike the rm -rf/sudo meltdown). Pressing the
  // button plays a boot log and reopens the shell. Unlike `reboot`, none
  // of this touches window.location — the in-memory filesystem survives
  // a shutdown/boot cycle exactly like a real disk would.
  //
  // `reboot` plays its own (shorter) log, then genuinely reloads the
  // page — that's what actually resets everything (ADR-0002), which a
  // shutdown/boot cycle deliberately does not. The fresh page's own
  // constructor always plays the boot log on load (any load, not just
  // this one), so the whole thing reads as one continuous "went down,
  // came back up" cycle without reboot needing to signal anything across
  // the reload itself.

  _startReboot() {
    this.els.shellInput.disabled = true;
    this._runLogLines(REBOOT_LOG_LINES, () => window.location.reload());
  }

  _startShutdown(delaySec) {
    if (this._shutdownPending || this._poweredOff) return;
    this._shutdownPending = true;
    this.els.shellInput.disabled = true;
    setTimeout(() => this._runShutdownLog(), Math.max(delaySec, 0) * 1000);
  }

  _runShutdownLog() {
    this._runLogLines(SHUTDOWN_LOG_LINES, () => this._powerOff());
  }

  _runBootLog() {
    this._runLogLines(BOOT_LOG_LINES, () => {
      this._poweredOff = false;
      this._shutdownPending = false;
      this.els.shellInput.disabled = false;
      this._updatePrompt();
      this._focusActive();
    });
  }

  // Shared by the shutdown and boot logs — prints `lines` one at a time
  // on an interval, then calls `onDone`; the only difference between
  // the two callers is the line list and what happens afterwards.
  _runLogLines(lines, onDone) {
    let i = 0;
    const interval = setInterval(() => {
      if (i >= lines.length) {
        clearInterval(interval);
        onDone();
        return;
      }
      this._printLine(lines[i], "line-hint");
      i++;
    }, 220);
  }

  _powerOff() {
    this._poweredOff = true;
    this.els.terminalPane.classList.add("powered-off");
    this.els.powerOverlay?.classList.remove("hidden");
  }

  _powerOn() {
    if (!this._poweredOff) return;
    this.els.powerOverlay?.classList.add("hidden");
    this.els.terminalPane.classList.remove("powered-off");
    this.els.terminalOutput.innerHTML = "";
    this._runBootLog();
  }

  // ---------- vim ----------

  // opts: { cursor: {row, col} } — used by tasks.js to start a task with
  // the cursor somewhere other than the top of the file.
  enterVim(path, opts = {}) {
    this.hideInlineHint();
    this.browserPath = null;
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
    // Only a real vim session leaving counts — exitVim() is also how the
    // directory browser (a different mode entirely, see below) returns
    // to the shell on q/Escape, which listeners like tutorial.js's
    // "save and quit" step must not mistake for :wq.
    const wasRealVim = !!this.engine;
    this.engine = null;
    this.vimPath = null;
    this.browserPath = null;
    this.els.vimView.classList.add("hidden");
    this.els.shellView.classList.remove("hidden");
    this._updatePrompt();
    this.els.shellInput.focus();
    if (wasRealVim) this.onVimExit();
  }

  // ---------- directory browser (vim/vi with no file — see shell.js's
  // "browse" action) ----------
  //
  // A separate, much smaller mode from the real vim engine on purpose:
  // this isn't vim editing, it's a way to *pick* a file to then actually
  // edit — implementing it as a real netrw-equivalent inside vim.js would
  // expand that engine's scope well past what ADR-0003 deliberately
  // limits it to. Reuses the vim view's DOM (buffer/statusline) purely
  // for a consistent look, but talks to `this.fs` directly, no VimEngine
  // involved.

  enterBrowser(dirPath) {
    this.hideInlineHint();
    this.engine = null;
    this.vimPath = null;
    this.browserPath = this.fs.normalize(dirPath);
    this.browserIndex = 0;
    this.els.shellView.classList.add("hidden");
    this.els.vimView.classList.remove("hidden");
    this._renderBrowser();
    this.els.vimView.focus();
  }

  _browserEntries() {
    const entries = this.fs.list(this.browserPath).slice();
    if (this.browserPath !== "/") entries.unshift({ name: "..", type: "dir" });
    return entries;
  }

  _renderBrowser() {
    const entries = this._browserEntries();
    if (this.browserIndex >= entries.length) this.browserIndex = entries.length - 1;
    if (this.browserIndex < 0) this.browserIndex = 0;

    const buf = this.els.vimBuffer;
    buf.innerHTML = "";
    entries.forEach((entry, i) => {
      const lineEl = document.createElement("div");
      lineEl.className = "vim-line" + (i === this.browserIndex ? " vim-line-active" : "");

      const lnum = document.createElement("span");
      lnum.className = "vim-lnum";
      lnum.textContent = i === this.browserIndex ? "→" : "";
      lineEl.appendChild(lnum);

      const textEl = document.createElement("span");
      textEl.className = "vim-text" + (entry.type === "dir" ? " browser-dir" : "");
      textEl.textContent = entry.type === "dir" ? entry.name + "/" : entry.name;
      lineEl.appendChild(textEl);

      buf.appendChild(lineEl);
    });

    this.els.windowTitle.textContent = `vim — ${this.fs.displayPath(this.browserPath)}`;
    this.els.vimModeIndicator.textContent = "BROWSE";
    this.els.vimFilename.textContent = this.fs.displayPath(this.browserPath);
    this.els.vimKeycount.textContent = "j/k move · Enter open · - up · q quit";
    this.els.vimPosition.textContent = `${entries.length} item${entries.length === 1 ? "" : "s"}`;
    this.els.vimView.className = "vim-view mode-browse";
    this.els.vimCmdline.classList.add("hidden");
  }

  _onBrowserKey(key) {
    const entries = this._browserEntries();
    if (key === "j" || key === "ArrowDown") {
      this.browserIndex = Math.min(entries.length - 1, this.browserIndex + 1);
      this._renderBrowser();
      return;
    }
    if (key === "k" || key === "ArrowUp") {
      this.browserIndex = Math.max(0, this.browserIndex - 1);
      this._renderBrowser();
      return;
    }
    if (key === "G") {
      this.browserIndex = entries.length - 1;
      this._renderBrowser();
      return;
    }
    if (key === "-" || key === "h" || key === "Backspace") {
      this.enterBrowser(this.fs.normalize(this.browserPath + "/.."));
      return;
    }
    if (key === "q" || key === "Escape") {
      this.exitVim();
      return;
    }
    if (key === "Enter" || key === "l") {
      const entry = entries[this.browserIndex];
      if (!entry) return;
      if (entry.name === "..") {
        this.enterBrowser(this.fs.normalize(this.browserPath + "/.."));
        return;
      }
      const path = (this.browserPath === "/" ? "" : this.browserPath) + "/" + entry.name;
      if (entry.type === "dir") this.enterBrowser(path);
      else this.enterVim(path);
    }
  }

  _onVimKeydown(e) {
    if (!this.engine && !this.browserPath) return;
    const key = this._translateKey(e);
    if (key === null) return; // key we don't handle — let the browser do its default thing
    e.preventDefault();

    if (this.browserPath) {
      this._onBrowserKey(key);
      return;
    }

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

