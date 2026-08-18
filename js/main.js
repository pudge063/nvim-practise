import { FileSystem } from "./filesystem.js";
import { Terminal } from "./terminal.js";
import { TaskManager } from "./tasks.js";
import { TutorialManager } from "./tutorial.js";

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
  shellHintPopup: $("shell-hint-popup"),
  shellHintText: $("shell-hint-text"),
  shellHintClose: $("shell-hint-close"),
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
  powerOverlay: $("power-overlay"),
  powerBtn: $("power-btn"),
  tutorialSteps: $("tutorial-steps"),
  tutorialStatus: $("tutorial-status"),
};

const fs = new FileSystem();
let taskManager;
let tutorialManager;
// The page opens on a plain, unmonitored terminal — "free mode" in
// effect, just without needing tasks.js's own freeplay button for it.
// Neither manager's callbacks fire until the learner actually picks a
// mode tab; the tabs themselves (see the always-on glow on whichever
// isn't active, in style.css) are the only thing inviting that click.
let mode = null;

const terminal = new Terminal({
  fs,
  els,
  onVimKeystroke: (state) => {
    if (mode === "tutorial") tutorialManager?.onVimKeystroke(state);
    else if (mode === "tasks") taskManager?.onVimKeystroke(state);
  },
  onShellCommand: (cmd, result) => {
    if (mode === "tutorial") tutorialManager?.onShellCommand(cmd, result);
  },
  onVimExit: () => {
    if (mode === "tutorial") tutorialManager?.onVimExit();
  },
});

taskManager = new TaskManager({ fs, terminal, els });
tutorialManager = new TutorialManager({ fs, terminal, els });

// ---------- mode switch (tutorial vs. tasks vs. the free-by-default page) ----------

const modeTutorialTab = $("mode-tutorial-tab");
const modeTasksTab = $("mode-tasks-tab");
const welcomePanel = $("welcome-panel");
const tutorialPanel = $("tutorial-panel");
const tasksPanel = $("tasks-panel");

function setMode(next) {
  mode = next;
  modeTutorialTab.classList.toggle("active", mode === "tutorial");
  modeTasksTab.classList.toggle("active", mode === "tasks");
  welcomePanel.classList.toggle("hidden", mode !== null);
  tutorialPanel.classList.toggle("hidden", mode !== "tutorial");
  tasksPanel.classList.toggle("hidden", mode !== "tasks");
  // Switching away from whichever mode was mid-lesson/mid-task in vim
  // shouldn't leave its popup lingering over the other mode's UI.
  terminal.hideInlineHint();
  terminal.hideShellHint();
  // Tutorial only actually seeds its file / shows its first hint the
  // first time its tab is opened — not on page load, and not again on
  // a later revisit (that would wipe mid-lesson progress).
  if (mode === "tutorial" && !tutorialManager.started) tutorialManager.start();
  // Picking a mode should drop the learner straight into typing, not
  // leave keyboard focus stranded on the tab button they just clicked.
  if (mode !== null) terminal.focusInput();
}

modeTutorialTab.addEventListener("click", () => setMode("tutorial"));
modeTasksTab.addEventListener("click", () => setMode("tasks"));

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
