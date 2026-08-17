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
  tasksList: $("tasks-list"),
  taskDetail: $("task-detail"),
  progressSummary: $("progress-summary"),
};

const fs = new FileSystem();
let taskManager;

const terminal = new Terminal({
  fs,
  els,
  onVimKeystroke: (state) => taskManager?.onVimKeystroke(state),
});

taskManager = new TaskManager({ fs, terminal, els });
