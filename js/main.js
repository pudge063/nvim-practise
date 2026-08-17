import { FileSystem } from "./filesystem.js";
import { Terminal } from "./terminal.js";
import { TaskManager } from "./tasks.js";

function $(id) {
  return document.getElementById(id);
}

const els = {
  terminalPane: $("terminal-pane"),
  windowTitle: $("window-title"),
  shellView: $("shell-view"),
  terminalOutput: $("terminal-output"),
  promptText: $("prompt-text"),
  shellInput: $("shell-input"),
  vimView: $("vim-view"),
  vimBuffer: $("vim-buffer"),
  vimCmdline: $("vim-cmdline"),
  vimCmdlinePrefix: $("vim-cmdline-prefix"),
  vimCmdlineText: $("vim-cmdline-text"),
  vimModeIndicator: $("vim-mode-indicator"),
  vimFilename: $("vim-filename"),
  vimKeycount: $("vim-keycount"),
  vimPosition: $("vim-position"),
  vimHintPopup: $("vim-hint-popup"),
  vimHintText: $("vim-hint-text"),
  vimHintClose: $("vim-hint-close"),
  tasksList: $("tasks-list"),
  taskDetail: $("task-detail"),
  progressSummary: $("progress-summary"),
  progressStars: $("progress-stars"),
  freeplayBtn: $("freeplay-btn"),
  meltdownOverlay: $("meltdown-overlay"),
};

const fs = new FileSystem();
let taskManager;

const terminal = new Terminal({
  fs,
  els,
  onVimKeystroke: (state) => taskManager?.onVimKeystroke(state),
});

taskManager = new TaskManager({ fs, terminal, els });

// Quickstart copy button — page-level chrome, doesn't belong to any
// module above (not shell/vim/task state). The whole install-command
// row is the click target, not a separate button next to it.
const installLine = $("promo-install-line");
const installCmd = $("promo-install-cmd");
const copyIcon = $("promo-copy-icon");
if (installLine && installCmd) {
  installLine.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(installCmd.textContent.trim());
    } catch {
      // Clipboard API unavailable (very old browser, non-secure context)
      // — select the text so the user can still Ctrl/Cmd-C it manually.
      const range = document.createRange();
      range.selectNodeContents(installCmd);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    installLine.classList.add("copied");
    const original = copyIcon.textContent;
    copyIcon.textContent = "✓";
    setTimeout(() => {
      copyIcon.textContent = original;
      installLine.classList.remove("copied");
    }, 1500);
  });
}
