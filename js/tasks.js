// Task set: data + validation only, no DOM here except the tiny render
// helpers at the bottom. See docs/adr/0004-task-validation.md for why
// `check()` looks at final buffer/cursor state instead of a keystroke log.

function joinSorted(lines) {
  return lines.slice().sort((a, b) => a.localeCompare(b));
}

export const TASKS = [
  // ---------- Движение ----------
  {
    id: "move-eol",
    category: "Движение",
    title: "Конец строки",
    description:
      "Курсор стоит в начале строки. Переместите его на <b>последний символ</b> этой же строки.",
    hint: "<code>$</code> переносит курсор на последний символ текущей строки — работает независимо от длины строки, в отличие от многократного <code>l</code>.",
    seed: {
      path: "/home/user/practice/move-eol.txt",
      lines: ["Держите курсор в начале — доберитесь до последнего символа этой строки."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 1,
    check(state) {
      return state.cursor.row === 0 && state.cursor.col === state.lines[0].length - 1;
    },
  },
  {
    id: "move-eof",
    category: "Движение",
    title: "Конец файла",
    description: "Переместите курсор на <b>последнюю строку</b> файла — одной командой, без счёта строк.",
    hint: "<code>G</code> без числа перед ней переносит курсор на последнюю строку файла.",
    seed: {
      path: "/home/user/practice/move-eof.txt",
      lines: ["первая", "вторая", "третья", "четвёртая", "пятая — сюда"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 1,
    check(state) {
      return state.cursor.row === state.lines.length - 1;
    },
  },
  {
    id: "move-bof",
    category: "Движение",
    title: "Начало файла",
    description: "Курсор стоит на последней строке. Вернитесь на <b>первую строку</b> файла.",
    hint: "<code>gg</code> (буква g дважды подряд) переносит курсор на первую строку файла — парная команда к <code>G</code>.",
    seed: {
      path: "/home/user/practice/move-bof.txt",
      lines: ["первая", "вторая", "третья", "четвёртая", "пятая"],
      cursor: { row: 4, col: 0 },
    },
    targetKeystrokes: 2,
    check(state) {
      return state.cursor.row === 0;
    },
  },
  {
    id: "move-word-count",
    category: "Движение",
    title: "Прыжок на N слов",
    description: "Не идите по одному слову — доберитесь до слова «<b>четыре</b>» одной командой с числом.",
    hint: "Число перед <code>w</code> повторяет прыжок нужное число раз: <code>3w</code> — на 3 слова вперёд за один шаг.",
    seed: {
      path: "/home/user/practice/move-word-count.txt",
      lines: ["один два три четыре пять шесть"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 2,
    check(state) {
      const col = state.lines[0].indexOf("четыре");
      return state.cursor.row === 0 && state.cursor.col === col;
    },
  },
  {
    id: "move-line-number",
    category: "Движение",
    title: "Перейти на конкретную строку",
    description: "Перепрыгните сразу на <b>строку 5</b>, не пролистывая остальные.",
    hint: "Команда <code>:5</code> (двоеточие, номер, Enter) или <code>5G</code> переносят курсор прямо на нужную строку.",
    seed: {
      path: "/home/user/practice/move-line-number.txt",
      lines: Array.from({ length: 8 }, (_, i) => `строка ${i + 1}`),
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.cursor.row === 4;
    },
  },

  // ---------- Слова и выделение ----------
  {
    id: "delete-word-diw",
    category: "Слова и выделение",
    title: "Удалить слово под курсором",
    description: "Курсор — на слове «СЛУЧАЙНОЕ». Удалите <b>только это слово</b>, не трогая пробелы вокруг.",
    hint: "<code>diw</code> (delete inner word) удаляет слово под курсором целиком, оставляя окружающие пробелы на месте.",
    seed: {
      path: "/home/user/practice/delete-word-diw.txt",
      lines: ["Удалите СЛУЧАЙНОЕ слово в этой строке."],
      cursor: { row: 0, col: "Удалите ".length },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "Удалите  слово в этой строке.";
    },
  },
  {
    id: "delete-word-daw",
    category: "Слова и выделение",
    title: "Удалить слово вместе с пробелом",
    description: "Уберите слово «ЛИШНЕЕ» <b>вместе с одним пробелом</b> рядом с ним — чтобы не осталось двойного пробела.",
    hint: "<code>daw</code> (delete around word) удаляет слово и один соседний пробел — в отличие от <code>diw</code>.",
    seed: {
      path: "/home/user/practice/delete-word-daw.txt",
      lines: ["Здесь ЛИШНЕЕ слово нужно убрать полностью."],
      cursor: { row: 0, col: "Здесь ".length },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "Здесь слово нужно убрать полностью.";
    },
  },
  {
    id: "visual-select-delete",
    category: "Слова и выделение",
    title: "Визуальное выделение",
    description: "Войдите в Visual mode (<code>v</code>), выделите слово «ЦЕЛЬ» движением и удалите выделенное.",
    hint: "<code>v</code> включает посимвольное выделение, движения вроде <code>e</code> или <code>w</code> расширяют его, затем <code>d</code> удаляет выделенный кусок.",
    seed: {
      path: "/home/user/practice/visual-select-delete.txt",
      lines: ["Выделите визуально слово ЦЕЛЬ и удалите его."],
      cursor: { row: 0, col: "Выделите визуально слово ".length },
    },
    targetKeystrokes: 4,
    check(state) {
      return (
        state.lines.length === 1 &&
        !state.lines[0].includes("ЦЕЛЬ") &&
        state.lines[0].includes("удалите его")
      );
    },
  },
  {
    id: "yank-paste-line",
    category: "Слова и выделение",
    title: "Скопировать и вставить строку",
    description: "Скопируйте текущую строку целиком и вставьте копию <b>сразу под ней</b>.",
    hint: "<code>yy</code> копирует строку в регистр, <code>p</code> вставляет её после текущей строки.",
    seed: {
      path: "/home/user/practice/yank-paste-line.txt",
      lines: ["Скопируйте эту строку и вставьте копию сразу под ней."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return (
        state.lines.length === 2 &&
        state.lines[0] === "Скопируйте эту строку и вставьте копию сразу под ней." &&
        state.lines[1] === state.lines[0]
      );
    },
  },

  // ---------- Поиск ----------
  {
    id: "search-basic",
    category: "Поиск",
    title: "Найти по образцу",
    description: "В этом лог-файле есть одна строка с «ERROR». Найдите её через поиск.",
    hint: "<code>/ERROR</code> и Enter ищут вперёд по тексту первое совпадение; курсор прыгнет прямо на него.",
    seed: {
      path: "/home/user/practice/search-basic.txt",
      lines: [
        "INFO: старт приложения",
        "DEBUG: инициализация модулей",
        "INFO: обработка запроса",
        "ERROR: файл конфигурации не найден",
        "INFO: завершение работы",
      ],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      const row = state.lines.findIndex((l) => l.includes("ERROR"));
      return state.cursor.row === row;
    },
  },
  {
    id: "search-repeat",
    category: "Поиск",
    title: "Повторить поиск",
    description: "Слово «купон» встречается несколько раз. Найдите его и перейдите ко <b>второму</b> совпадению.",
    hint: "После <code>/купон</code> + Enter курсор на первом совпадении; клавиша <code>n</code> переходит к следующему в том же направлении.",
    seed: {
      path: "/home/user/practice/search-repeat.txt",
      lines: [
        "первый купон использован",
        "здесь ничего интересного",
        "второй купон ещё активен",
        "и третий купон про запас",
      ],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      const rows = state.lines
        .map((l, i) => (l.includes("купон") ? i : -1))
        .filter((i) => i !== -1);
      return state.cursor.row === rows[1];
    },
  },

  // ---------- Сортировка и команды ----------
  {
    id: "sort-all",
    category: "Сортировка и команды",
    title: "Отсортировать весь файл",
    description: "Отсортируйте список фруктов <b>по алфавиту</b> — весь файл целиком.",
    hint: "Команда <code>:sort</code> сортирует все строки буфера по алфавиту.",
    seed: {
      path: "/home/user/practice/sort-all.txt",
      lines: ["банан", "яблоко", "вишня", "абрикос"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 6,
    check(state) {
      return state.lines.join("\n") === joinSorted(["банан", "яблоко", "вишня", "абрикос"]).join("\n");
    },
  },
  {
    id: "sort-selection",
    category: "Сортировка и команды",
    title: "Отсортировать выделенное",
    description:
      "Строки-разделители («---») трогать нельзя — отсортируйте <b>только три строки между ними</b>.",
    hint: "Выделите средние строки через <code>V</code> и <code>j j</code>, затем наберите <code>:</code> — диапазон <code>'&lt;,'&gt;</code> подставится сам, допишите <code>sort</code> и нажмите Enter.",
    seed: {
      path: "/home/user/practice/sort-selection.txt",
      lines: ["--- не трогать ---", "банан", "яблоко", "вишня", "--- не трогать ---"],
      cursor: { row: 1, col: 0 },
    },
    targetKeystrokes: 10,
    check(state) {
      return (
        state.lines[0] === "--- не трогать ---" &&
        state.lines[4] === "--- не трогать ---" &&
        state.lines.slice(1, 4).join("\n") === joinSorted(["банан", "яблоко", "вишня"]).join("\n")
      );
    },
  },
  {
    id: "substitute-line",
    category: "Сортировка и команды",
    title: "Заменить в строке",
    description: "Замените первое слово «foo» на «bar» — <b>только первое вхождение</b> в этой строке.",
    hint: "<code>:s/foo/bar/</code> заменяет первое совпадение в текущей строке. Без <code>g</code> в конце — только первое.",
    seed: {
      path: "/home/user/practice/substitute-line.txt",
      lines: ["foo раз, foo два, foo три — замените только первое."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      return state.lines[0] === "bar раз, foo два, foo три — замените только первое.";
    },
  },
  {
    id: "substitute-global",
    category: "Сортировка и команды",
    title: "Заменить везде",
    description: "Замените <b>все</b> вхождения «foo» на «bar» — по всему файлу, во всех строках.",
    hint: "<code>:%s/foo/bar/g</code> — <code>%</code> значит «все строки», <code>g</code> в конце значит «все вхождения в строке», а не только первое.",
    seed: {
      path: "/home/user/practice/substitute-global.txt",
      lines: ["foo foo foo", "строка без совпадений", "ещё один foo тут"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      return (
        state.lines[0] === "bar bar bar" &&
        state.lines[1] === "строка без совпадений" &&
        state.lines[2] === "ещё один bar тут"
      );
    },
  },

  // ---------- Редактирование ----------
  {
    id: "replace-char",
    category: "Редактирование",
    title: "Заменить один символ",
    description: "В слове опечатка: «Кэт» вместо «Кот». Исправьте <b>одной командой</b>, не входя в insert mode.",
    hint: "<code>r</code> + символ заменяет ровно один символ под курсором и сразу возвращает в Normal mode.",
    seed: {
      path: "/home/user/practice/replace-char.txt",
      lines: ["Кэт сидит на окне."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "Кот сидит на окне.";
    },
  },
  {
    id: "undo-edit",
    category: "Редактирование",
    title: "Отменить изменение",
    description:
      "Удалите эту строку командой <code>dd</code>, посмотрите, что она пропала — а затем <b>верните её обратно</b>.",
    hint: "<code>u</code> отменяет последнее изменение. Файл должен вернуться в точности к тому, с чего вы начали.",
    seed: {
      path: "/home/user/practice/undo-edit.txt",
      lines: ["Эту строку можно удалить — а потом обязательно верните её отменой."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return (
        state.editCount >= 1 &&
        state.lines.join("\n") === "Эту строку можно удалить — а потом обязательно верните её отменой."
      );
    },
  },
];

export const CATEGORY_ORDER = [
  "Движение",
  "Слова и выделение",
  "Поиск",
  "Сортировка и команды",
  "Редактирование",
];

export class TaskManager {
  constructor({ fs, terminal, els }) {
    this.fs = fs;
    this.terminal = terminal;
    this.els = els;
    this.activeTaskId = null;
    this.doneIds = new Set();
    this.hintShown = false;
    this._renderList();
    this._renderProgress();
  }

  openTask(id) {
    const task = TASKS.find((t) => t.id === id);
    if (!task) return;
    this.activeTaskId = id;
    this.hintShown = false;
    this.fs.write(task.seed.path, task.seed.lines.join("\n"));
    this.terminal.enterVim(task.seed.path, { cursor: task.seed.cursor });
    this._renderList();
    this._renderDetail(task, false);
  }

  onVimKeystroke(state) {
    if (!this.activeTaskId) return;
    const task = TASKS.find((t) => t.id === this.activeTaskId);
    if (!task) return;
    const ok = task.check(state);
    this._updateStatus(task, state, ok);
    if (ok && !this.doneIds.has(task.id)) {
      this.doneIds.add(task.id);
      this._renderList();
      this._renderProgress();
    }
  }

  _renderList() {
    const el = this.els.tasksList;
    el.innerHTML = "";
    for (const category of CATEGORY_ORDER) {
      const header = document.createElement("div");
      header.className = "task-category";
      header.textContent = category;
      el.appendChild(header);
      for (const task of TASKS.filter((t) => t.category === category)) {
        const btn = document.createElement("button");
        btn.className =
          "task-item" + (task.id === this.activeTaskId ? " active" : "") + (this.doneIds.has(task.id) ? " done" : "");
        const check = document.createElement("span");
        check.className = "task-check";
        check.textContent = this.doneIds.has(task.id) ? "✓" : "";
        btn.appendChild(check);
        btn.appendChild(document.createTextNode(task.title));
        btn.addEventListener("click", () => this.openTask(task.id));
        el.appendChild(btn);
      }
    }
  }

  _renderProgress() {
    this.els.progressSummary.textContent = `${this.doneIds.size} / ${TASKS.length} выполнено`;
  }

  _renderDetail(task, hintShown) {
    const el = this.els.taskDetail;
    el.innerHTML = "";

    const h3 = document.createElement("h3");
    h3.textContent = task.title;
    el.appendChild(h3);

    const meta = document.createElement("div");
    meta.className = "task-meta";
    meta.textContent =
      task.category + (task.targetKeystrokes ? ` · у профи выходит примерно за ${task.targetKeystrokes} нажатий` : "");
    el.appendChild(meta);

    const desc = document.createElement("div");
    desc.className = "task-desc";
    desc.innerHTML = task.description;
    el.appendChild(desc);

    const hintBtn = document.createElement("button");
    hintBtn.className = "hint-btn";
    hintBtn.textContent = "💡 Показать подсказку";
    el.appendChild(hintBtn);

    const hintBox = document.createElement("div");
    hintBox.className = "hint-box hidden";
    hintBox.innerHTML = task.hint;
    el.appendChild(hintBox);

    hintBtn.addEventListener("click", () => {
      hintBox.classList.toggle("hidden");
    });
    if (hintShown) hintBox.classList.remove("hidden");

    const status = document.createElement("div");
    status.className = "task-status status-pending";
    status.textContent = this.doneIds.has(task.id) ? "✓ Выполнено!" : "Пока не выполнено";
    status.classList.toggle("status-done", this.doneIds.has(task.id));
    el.appendChild(status);
    this._statusEl = status;

    const reopenBtn = document.createElement("button");
    reopenBtn.className = "reopen-btn";
    reopenBtn.textContent = "↺ Начать заново";
    reopenBtn.addEventListener("click", () => this.openTask(task.id));
    el.appendChild(reopenBtn);
  }

  _updateStatus(task, state, ok) {
    if (!this._statusEl) return;
    if (ok) {
      this._statusEl.textContent = "✓ Выполнено!";
      this._statusEl.classList.add("status-done");
      this._statusEl.classList.remove("status-pending");
    } else {
      this._statusEl.textContent = `Пока не выполнено (нажатий: ${state.keystrokes})`;
      this._statusEl.classList.remove("status-done");
      this._statusEl.classList.add("status-pending");
    }
  }
}
