// Guided, step-by-step onboarding — distinct from tasks.js's free-choice
// challenge set (ADR-0004). Each step is shown live as a persistent
// terminal popup (not the "you look stuck" nudge tasks use) and advances
// itself the moment the learner does the right thing — no submit button,
// no "check my answer." See docs/adr/0007-tutorial-mode.md.

// Lives directly in $HOME (not practice/, unlike tasks.js's files) on
// purpose: the very first command a brand-new learner ever types should
// be exactly what the hint says, `vim tutorial.txt`, with no subdirectory
// to get wrong — that mismatch was a real bug here (hint said one path,
// seed wrote another, so the learner's first "vim tutorial.txt" opened a
// blank, unrelated file and every later step's cursor checks stalled).
export const TUTORIAL_PATH = "/home/user/tutorial.txt";
export const TUTORIAL_SEED = [
  "Добро пожаловать в обучение!",
  "Эта строка — просто текст для тренировки движений.",
  "Подсказки появляются сами прямо здесь, в терминале.",
  "Просто делайте то, что там написано — шаг сам засчитается.",
  "Почти конец файла — ещё пара строк ниже.",
  "Последняя строка. Отсюда некуда двигаться дальше вниз.",
].join("\n");

// `isDone` receives (state, stepStartState) — stepStartState is a
// snapshot of getState() taken the moment this step became current, so
// steps can check *relative* progress (moved down a line, buffer got
// shorter) instead of hardcoding absolute positions that only make
// sense for one exact seed file.
export const TUTORIAL_STEPS = [
  {
    id: "open-vim",
    location: "shell",
    title: "Откройте vim",
    hint: `Наберите <code>vim tutorial.txt</code> и нажмите Enter — откроется учебный файл.`,
  },
  {
    id: "move-right",
    location: "vim",
    title: "Движение вправо",
    hint: `Вы в Normal mode. <code>h</code> <code>j</code> <code>k</code> <code>l</code> — это движение курсора: влево / вниз / вверх / вправо (замена стрелкам, руки не уходят с буквенных клавиш). Нажмите <code>l</code> три раза.`,
    isDone: (state, start) => state.cursor.row === start.cursor.row && state.cursor.col - start.cursor.col >= 3,
  },
  {
    id: "move-down",
    location: "vim",
    title: "Движение вниз",
    hint: `Теперь нажмите <code>j</code>, чтобы спуститься на строку ниже.`,
    isDone: (state, start) => state.cursor.row > start.cursor.row,
  },
  {
    id: "move-line-start",
    location: "vim",
    title: "Начало строки",
    hint: `<code>0</code> (ноль) — переносит курсор в самое начало текущей строки, одной командой.`,
    isDone: (state) => state.cursor.col === 0,
  },
  {
    id: "move-line-end",
    location: "vim",
    title: "Конец строки",
    hint: `А <code>$</code> — наоборот, в конец строки. Попробуйте.`,
    isDone: (state) => state.cursor.col === Math.max(0, state.lines[state.cursor.row].length - 1) && state.lines[state.cursor.row].length > 1,
  },
  {
    id: "insert",
    location: "vim",
    title: "Insert mode",
    hint: `<code>i</code> входит в Insert mode прямо перед курсором — печатайте что угодно, затем <code>Esc</code>, чтобы вернуться в Normal mode.`,
    isDone: (state, start) => state.mode === "normal" && state.editCount > start.editCount,
  },
  {
    id: "delete-line",
    location: "vim",
    title: "Удаление строки",
    hint: `<code>dd</code> удаляет текущую строку целиком. Попробуйте — не бойтесь, дальше научимся это отменять.`,
    isDone: (state, start) => state.lines.length < start.lines.length,
  },
  {
    id: "undo",
    location: "vim",
    title: "Отмена",
    hint: `<code>u</code> отменяет последнее изменение. Верните удалённую строку обратно.`,
    isDone: (state, start) => state.lines.length > start.lines.length,
  },
  {
    id: "save-quit",
    location: "vim",
    title: "Сохранить и выйти",
    hint: `Финал: наберите <code>:wq</code> и нажмите Enter — сохранит файл и вернёт вас в терминал.`,
    // No isDone check — this step completes via the onVimExit hook
    // (terminal.js), since :wq tears the vim engine down entirely
    // rather than leaving a state to inspect.
  },
];

export class TutorialManager {
  constructor({ fs, terminal, els }) {
    this.fs = fs;
    this.terminal = terminal;
    this.els = els;
    this.stepIndex = -1;
    this.stepStartState = null;
    this.done = false;
    this._renderStepList();
  }

  start() {
    this.stepIndex = 0;
    this.done = false;
    this.fs.write(TUTORIAL_PATH, TUTORIAL_SEED);
    this._renderStepList();
    this._showCurrentHint();
  }

  get currentStep() {
    return TUTORIAL_STEPS[this.stepIndex];
  }

  _showCurrentHint() {
    const step = this.currentStep;
    if (!step) return;
    if (step.location === "shell") {
      this.terminal.showShellHint(step.hint, { persistent: true });
      this.terminal.hideInlineHint();
    } else {
      this.terminal.showInlineHint(step.hint, { persistent: true });
      this.terminal.hideShellHint();
    }
    this._updateStatus();
  }

  // Called for every shell command while tutorial mode is active — only
  // the "open-vim" step (location: "shell") cares.
  onShellCommand(cmd, result) {
    if (this.done || this.stepIndex < 0) return;
    const step = this.currentStep;
    if (!step || step.location !== "shell") return;
    // terminal.js fires onShellCommand after enterVim() already ran, so
    // the engine (and a real starting state for the next step) exists.
    if (result.action?.type === "vim") {
      this._advance(this.terminal.engine ? this.terminal.engine.getState() : null);
    }
  }

  // Called on every vim keystroke while tutorial mode is active.
  onVimKeystroke(state) {
    if (this.done || this.stepIndex < 0) return;
    const step = this.currentStep;
    if (!step || step.location !== "vim") return;
    if (!this.stepStartState) this.stepStartState = state;
    if (step.isDone && step.isDone(state, this.stepStartState)) this._advance(state);
  }

  // Called when the learner leaves vim (:q/:wq) — the only way the final
  // "save-quit" step can complete, since there's no post-exit state to
  // check.
  onVimExit() {
    if (this.done || this.stepIndex < 0) return;
    const step = this.currentStep;
    if (step?.id === "save-quit") this._advance(null);
  }

  // `nextStepFirstState` is the baseline the *new* current step's
  // `isDone` compares against — the state right as this step finished
  // (or, from the shell step, the state right after vim opened). Passing
  // it explicitly here means every "did the cursor move" style check is
  // relative to where the learner actually was, never a hardcoded 0,0.
  _advance(nextStepFirstState) {
    this.terminal.hideInlineHint();
    this.terminal.hideShellHint();
    this.stepIndex++;
    this.stepStartState = nextStepFirstState;
    this._renderStepList();
    if (this.stepIndex >= TUTORIAL_STEPS.length) {
      this.done = true;
      this._updateStatus();
      return;
    }
    this._showCurrentHint();
  }

  _renderStepList() {
    const el = this.els.tutorialSteps;
    if (!el) return;
    el.innerHTML = "";
    TUTORIAL_STEPS.forEach((step, i) => {
      const li = document.createElement("li");
      li.className =
        "tutorial-step" +
        (i < this.stepIndex || this.done ? " done" : "") +
        (i === this.stepIndex && !this.done ? " active" : "");
      const marker = document.createElement("span");
      marker.className = "tutorial-step-marker";
      marker.textContent = i < this.stepIndex || this.done ? "✓" : String(i + 1);
      li.appendChild(marker);
      li.appendChild(document.createTextNode(step.title));
      el.appendChild(li);
    });
  }

  _updateStatus() {
    const el = this.els.tutorialStatus;
    if (!el) return;
    if (this.done) {
      el.textContent = "🎉 Обучение пройдено! Загляните в «Задания» — там задачи посложнее.";
      el.className = "task-status status-done";
      return;
    }
    const step = this.currentStep;
    el.textContent = step ? `Шаг ${this.stepIndex + 1} из ${TUTORIAL_STEPS.length}: ${step.title}` : "";
    el.className = "task-status status-pending";
  }
}
