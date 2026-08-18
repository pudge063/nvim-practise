// Task set: data + validation only, plus the small amount of DOM needed
// to render the tile grid / detail panel. See
// docs/adr/0004-task-validation.md for why `check()` looks at final
// buffer/cursor state instead of a keystroke log.
import { burstStars, pulse, popIn } from "./effects.js";

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
  {
    id: "move-first-nonblank",
    category: "Движение",
    title: "Первый непробельный символ",
    description:
      "Курсор — в конце строки, у которой много пробелов в начале. Встаньте на <b>первый настоящий символ</b> строки, а не на пробел.",
    hint: "<code>^</code> переносит курсор на первый непробельный символ строки. Не путайте с <code>0</code> — та идёт в самый первый столбец, включая пробелы.",
    seed: {
      path: "/home/user/practice/move-first-nonblank.txt",
      lines: ["     здесь много пробелов перед текстом"],
      cursor: { row: 0, col: "     здесь много пробелов перед текстом".length - 1 },
    },
    targetKeystrokes: 1,
    check(state) {
      const idx = state.lines[0].search(/\S/);
      return state.cursor.row === 0 && state.cursor.col === idx;
    },
  },
  {
    id: "move-find-char",
    category: "Движение",
    title: "Прыжок к символу",
    description: "Найдите символ <b>#</b> в строке и встаньте прямо на него — одной командой.",
    hint: "<code>f#</code> ищет вперёд по строке первый символ <code>#</code> и сразу ставит на него курсор.",
    seed: {
      path: "/home/user/practice/move-find-char.txt",
      lines: ["текст-текст #здесь-решётка-текст"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 2,
    check(state) {
      return state.cursor.row === 0 && state.lines[0][state.cursor.col] === "#";
    },
  },
  {
    id: "move-count-lines",
    category: "Движение",
    title: "Точный прыжок вниз",
    description: "Переместитесь ровно на <b>6 строк вниз</b> — одной командой, без шести отдельных нажатий.",
    hint: "Число перед <code>j</code> — <code>6j</code> — сразу переносит курсор на 6 строк вниз.",
    seed: {
      path: "/home/user/practice/move-count-lines.txt",
      lines: Array.from({ length: 10 }, (_, i) => `строка ${i + 1}`),
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 2,
    check(state) {
      return state.cursor.row === 6;
    },
  },
  {
    id: "move-word-end",
    category: "Движение",
    title: "Конец слова",
    description: "Встаньте ровно на <b>последнюю букву</b> слова «длинного» — одной командой.",
    hint: "<code>e</code> переносит курсор на конец текущего/следующего слова — в отличие от <code>w</code>, которая идёт на НАЧАЛО следующего слова.",
    seed: {
      path: "/home/user/practice/move-word-end.txt",
      lines: ["прыжок до конца длинного слова тут"],
      cursor: { row: 0, col: "прыжок до конца ".length },
    },
    targetKeystrokes: 1,
    check(state) {
      const word = "длинного";
      const start = state.lines[0].indexOf(word);
      return state.cursor.row === 0 && state.cursor.col === start + word.length - 1;
    },
  },
  {
    id: "move-word-back",
    category: "Движение",
    title: "Слово назад",
    description: "Вернитесь курсором на <b>начало слова «начало»</b> — одной командой назад.",
    hint: "<code>b</code> — парная команда к <code>w</code>, но в обратную сторону: на начало предыдущего слова.",
    seed: {
      path: "/home/user/practice/move-word-back.txt",
      lines: ["вернитесь назад к слову начало отсюда"],
      cursor: { row: 0, col: "вернитесь назад к слову начало ".length },
    },
    targetKeystrokes: 1,
    check(state) {
      return state.cursor.row === 0 && state.cursor.col === state.lines[0].indexOf("начало");
    },
  },
  {
    id: "move-count-h",
    category: "Движение",
    title: "Точный прыжок влево",
    description: "Сдвиньтесь ровно на <b>5 символов влево</b> от текущей позиции — одной командой.",
    hint: "Число перед <code>h</code> — <code>5h</code> — работает так же, как <code>6j</code>, только по горизонтали.",
    seed: {
      path: "/home/user/practice/move-count-h.txt",
      lines: ["подвиньтесь на пять влево ровно отсюда, здесь текста побольше"],
      cursor: { row: 0, col: 20 },
    },
    targetKeystrokes: 2,
    check(state) {
      return state.cursor.row === 0 && state.cursor.col === 15;
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
    targetKeystrokes: 3,
    check(state) {
      return (
        state.lines.length === 1 &&
        !state.lines[0].includes("ЦЕЛЬ") &&
        state.lines[0].includes("удалите его")
      );
    },
  },
  {
    id: "visual-line-select-delete",
    category: "Слова и выделение",
    title: "Визуальное выделение по строкам",
    description: "Удалите <b>три средние строки</b> (со словом УДАЛИТЬ) одним визуальным выделением по линиям.",
    hint: "<code>V</code> включает построчное выделение, <code>j</code> расширяет его вниз, затем <code>d</code> удаляет всё выделенное разом.",
    seed: {
      path: "/home/user/practice/visual-line-select-delete.txt",
      lines: ["оставить1", "УДАЛИТЬ2", "УДАЛИТЬ3", "УДАЛИТЬ4", "оставить5"],
      cursor: { row: 1, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines.join("\n") === "оставить1\nоставить5";
    },
  },
  {
    id: "change-word-ciw",
    category: "Слова и выделение",
    title: "Заменить слово одной командой",
    description: "В слове «teh» опечатка — исправьте его на «the», не удаляя отдельной командой перед вставкой.",
    hint: "<code>ciw</code> (change inner word) удаляет слово под курсором и сразу переключает в Insert mode — печатайте новое слово и Esc.",
    seed: {
      path: "/home/user/practice/change-word-ciw.txt",
      lines: ["Здесь опечатка: teh — надо: the"],
      cursor: { row: 0, col: "Здесь опечатка: ".length },
    },
    targetKeystrokes: 6,
    check(state) {
      return state.lines[0] === "Здесь опечатка: the — надо: the";
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
  {
    id: "yank-word-paste-elsewhere",
    category: "Слова и выделение",
    title: "Скопировать слово в другое место",
    description: "Скопируйте слово «ОБРАЗЕЦ» (без пробелов вокруг) и вставьте его копию во <b>вторую строку</b>.",
    hint: "<code>yiw</code> копирует слово под курсором без пробелов вокруг; переместитесь на вторую строку (например <code>j</code>), затем <code>p</code> вставит скопированное после текущего символа.",
    seed: {
      path: "/home/user/practice/yank-word-paste-elsewhere.txt",
      lines: ["скопируйте слово ОБРАЗЕЦ и вставьте его в конец", "сюда: "],
      cursor: { row: 0, col: "скопируйте слово ".length },
    },
    targetKeystrokes: 5,
    check(state) {
      return (
        state.lines[0] === "скопируйте слово ОБРАЗЕЦ и вставьте его в конец" && state.lines[1].includes("ОБРАЗЕЦ")
      );
    },
  },
  {
    id: "change-word-cw",
    category: "Слова и выделение",
    title: "Заменить слово через cw",
    description: "В слове опечатка: «ошибка» — исправьте на «правильно», удалив и сразу начав печатать одной командой.",
    hint: "<code>cw</code> (change word) удаляет слово и сразу входит в Insert mode — в отличие от <code>dw</code>, пробел после слова не трогается, набранный текст встанет ровно на его место.",
    seed: {
      path: "/home/user/practice/change-word-cw.txt",
      lines: ["Замените слово ошибка здесь на слово исправлено"],
      cursor: { row: 0, col: "Замените слово ".length },
    },
    targetKeystrokes: 12,
    check(state) {
      return state.lines[0] === "Замените слово правильно здесь на слово исправлено";
    },
  },
  {
    id: "visual-yank-paste",
    category: "Слова и выделение",
    title: "Скопировать визуальным выделением",
    description: "Выделите слово «ВОТЭТО» через Visual mode, <b>скопируйте</b> (не удаляйте) и вставьте копию во вторую строку.",
    hint: "<code>v</code> + <code>e</code> выделяет слово целиком, <code>y</code> копирует выделенное (в отличие от <code>d</code>, ничего не удаляя), затем перейдите строкой ниже и <code>p</code>.",
    seed: {
      path: "/home/user/practice/visual-yank-paste.txt",
      lines: ["скопируйте слово ВОТЭТО отсюда", "а сюда: "],
      cursor: { row: 0, col: "скопируйте слово ".length },
    },
    targetKeystrokes: 6,
    check(state) {
      return state.lines[0].includes("ВОТЭТО") && state.lines[1].includes("ВОТЭТО");
    },
  },
  {
    id: "delete-count-words",
    category: "Слова и выделение",
    title: "Удалить несколько слов сразу",
    description: "Удалите ровно <b>первые два слова</b> одной командой.",
    hint: "Число перед оператором с движением — <code>2dw</code> — удаляет 2 слова разом, так же как <code>3dd</code> удаляет 3 строки.",
    seed: {
      path: "/home/user/practice/delete-count-words.txt",
      lines: ["раз два три четыре пять шесть"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "три четыре пять шесть";
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
      const rows = state.lines.map((l, i) => (l.includes("купон") ? i : -1)).filter((i) => i !== -1);
      return state.cursor.row === rows[1];
    },
  },
  {
    id: "search-wrap",
    category: "Поиск",
    title: "Поиск с оборотом через конец файла",
    description:
      "Слово «МАЯК» есть только вверху файла, а курсор — внизу. Найдите его поиском вперёд: он обернётся через конец файла.",
    hint: "<code>/МАЯК</code> и Enter — раз совпадение только одно и оно позади курсора, поиск обернётся через конец файла и найдёт его.",
    seed: {
      path: "/home/user/practice/search-wrap.txt",
      lines: ["МАЯК тут", "два", "три", "четыре", "пять"],
      cursor: { row: 4, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      return state.cursor.row === 0 && state.cursor.col === state.lines[0].indexOf("МАЯК");
    },
  },
  {
    id: "search-then-edit",
    category: "Поиск",
    title: "Найти и сразу исправить",
    description: "Найдите слово «МУСОР» поиском и удалите его прямо там — связка поиска с редактированием, как в реальной работе.",
    hint: "<code>/МУСОР</code> + Enter находит слово, курсор уже стоит на нём — дальше подойдёт любой способ удаления слова, например <code>diw</code>.",
    seed: {
      path: "/home/user/practice/search-then-edit.txt",
      lines: ["первая строка", "здесь есть МУСОР который нужно убрать", "третья строка"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      return state.lines.length === 3 && !state.lines[1].includes("МУСОР") && state.lines[1].includes("убрать");
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
  {
    id: "delete-count-lines",
    category: "Сортировка и команды",
    title: "Удалить N строк одной командой",
    description: "Удалите ровно <b>3 первые строки</b> — одной командой, а не тремя отдельными.",
    hint: "Число перед <code>dd</code> повторяет удаление: <code>3dd</code> удаляет 3 строки разом.",
    seed: {
      path: "/home/user/practice/delete-count-lines.txt",
      lines: Array.from({ length: 6 }, (_, i) => `фраза ${i + 1}`),
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines.length === 3 && state.lines[0] === "фраза 4";
    },
  },
  {
    id: "yank-count-lines-paste",
    category: "Сортировка и команды",
    title: "Скопировать N строк в конец файла",
    description: "Скопируйте первые <b>2 строки</b> одной командой и вставьте копию в самый <b>конец файла</b>.",
    hint: "<code>2yy</code> копирует 2 строки разом; <code>G</code> переносит в конец файла; <code>p</code> вставляет скопированное после текущей строки.",
    seed: {
      path: "/home/user/practice/yank-count-lines-paste.txt",
      lines: ["альфа", "бета", "гамма", "дельта"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 5,
    check(state) {
      return state.lines.join("\n") === "альфа\nбета\nгамма\nдельта\nальфа\nбета";
    },
  },
  {
    id: "substitute-count",
    category: "Сортировка и команды",
    title: "Перейти на строку и заменить",
    description: "Перейдите на <b>строку 2</b> и замените там слово «цель» на «результат».",
    hint: "<code>:2</code> переносит на строку 2, затем <code>:s/цель/результат/</code> заменяет слово в текущей строке — две команды подряд, каждая начинается с <code>:</code>.",
    seed: {
      path: "/home/user/practice/substitute-count.txt",
      lines: ["первая", "вторая цель здесь", "третья", "четвёртая", "пятая"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: null,
    check(state) {
      return (
        state.lines[1] === "вторая результат здесь" &&
        state.lines[0] === "первая" &&
        state.lines[2] === "третья"
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
    id: "replace-count-chars",
    category: "Редактирование",
    title: "Заменить несколько символов разом",
    description: "Замените ровно <b>первые 3 символа x</b> на y — одной командой, не тремя отдельными.",
    hint: "Число перед <code>r</code> — <code>3ry</code> — заменяет сразу 3 символа под курсором на новый символ y.",
    seed: {
      path: "/home/user/practice/replace-count-chars.txt",
      lines: ["xxxxx нужно заменить первые три x на y"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "yyyxx нужно заменить первые три x на y";
    },
  },
  {
    id: "open-above-insert",
    category: "Редактирование",
    title: "Новая строка сверху",
    description: 'Добавьте новую строку СВЕРХУ существующей с текстом ровно: <code>новая строка</code>.',
    hint: "<code>O</code> (заглавная) открывает новую строку НАД текущей и сразу входит в Insert mode.",
    seed: {
      path: "/home/user/practice/open-above-insert.txt",
      lines: ["вторая строка (уже существует)"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 15,
    check(state) {
      return (
        state.lines.length === 2 &&
        state.lines[0] === "новая строка" &&
        state.lines[1] === "вторая строка (уже существует)"
      );
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
  {
    id: "redo-edit",
    category: "Редактирование",
    title: "Повторить отменённое",
    description:
      "Удалите строку (<code>dd</code>), отмените (<code>u</code>) — а затем <b>повторите отменённое действие</b>, чтобы строка снова исчезла.",
    hint: "<code>Ctrl-r</code> — парная команда к <code>u</code>: повторяет то, что было отменено. Полезно, если отменили случайно лишний раз.",
    seed: {
      path: "/home/user/practice/redo-edit.txt",
      lines: ["Строку удалите, отмените, потом верните удаление через redo."],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 4,
    check(state) {
      return state.redoCount >= 1 && state.lines.join("\n") === "";
    },
  },
  {
    id: "open-below",
    category: "Редактирование",
    title: "Новая строка снизу",
    description: 'Добавьте новую строку СНИЗУ существующей с текстом ровно: <code>вторая строка</code>.',
    hint: "<code>o</code> (строчная) открывает новую строку ПОД текущей и сразу входит в Insert mode — парная команда к <code>O</code>.",
    seed: {
      path: "/home/user/practice/open-below.txt",
      lines: ["первая строка (существует)"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 15,
    check(state) {
      return (
        state.lines.length === 2 &&
        state.lines[0] === "первая строка (существует)" &&
        state.lines[1] === "вторая строка"
      );
    },
  },
  {
    id: "paste-before",
    category: "Редактирование",
    title: "Вставить перед строкой",
    description: "Скопируйте первую строку и вставьте копию так, чтобы она оказалась <b>перед</b> строкой «бета», а не после неё.",
    hint: "<code>yy</code> копирует строку, <code>j</code> — на следующую, а <code>P</code> (заглавная) вставляет ПЕРЕД текущей строкой — в отличие от строчной <code>p</code>.",
    seed: {
      path: "/home/user/practice/paste-before.txt",
      lines: ["альфа", "бета"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 4,
    check(state) {
      return state.lines.join("\n") === "альфа\nальфа\nбета";
    },
  },
  {
    id: "append-eol",
    category: "Редактирование",
    title: "Добавить в конец строки",
    description: 'Допишите в самый конец строки ровно: <code>!!!</code> — одной командой, не считая символов.',
    hint: "<code>A</code> (заглавная) сразу переносит курсор в конец строки И входит в Insert mode — быстрее, чем <code>$</code> + <code>a</code>.",
    seed: {
      path: "/home/user/practice/append-eol.txt",
      lines: ["Допишите сюда"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 5,
    check(state) {
      return state.lines[0] === "Допишите сюда!!!";
    },
  },
  {
    id: "insert-first-nonblank",
    category: "Редактирование",
    title: "Вставить перед текстом, не перед пробелами",
    description: "Курсор в конце строки с отступом. Допишите <code>ВОТ </code> прямо перед первым словом, не трогая отступ.",
    hint: "<code>I</code> (заглавная) переносит курсор на первый непробельный символ строки И входит в Insert mode — сочетание <code>^</code> + <code>i</code> одной командой.",
    seed: {
      path: "/home/user/practice/insert-first-nonblank.txt",
      lines: ["      сюда что-то допишите спереди"],
      cursor: { row: 0, col: "      сюда что-то допишите спереди".length - 1 },
    },
    targetKeystrokes: 6,
    check(state) {
      return state.lines[0] === "      ВОТ сюда что-то допишите спереди";
    },
  },
  {
    id: "delete-to-char",
    category: "Редактирование",
    title: "Удалить до символа",
    description: "Удалите весь текст от начала строки до символа <code>|</code> включительно, одной командой.",
    hint: "<code>df|</code> удаляет всё от курсора до следующего символа <code>|</code>, включая его самого — тот же приём, что и <code>df)</code>, только с другим символом.",
    seed: {
      path: "/home/user/practice/delete-to-char.txt",
      lines: ["уберите-префикс-до|этого-места"],
      cursor: { row: 0, col: 0 },
    },
    targetKeystrokes: 3,
    check(state) {
      return state.lines[0] === "этого-места";
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

// Star rating on completion — see docs/adr/0004-task-validation.md: this
// is informational/rewarding, never a pass/fail gate. Tasks with no
// `targetKeystrokes` reference always award full stars just for the
// (final-state-checked) result.
function computeStars(task, state) {
  if (!task.targetKeystrokes) return 3;
  const ratio = state.keystrokes / task.targetKeystrokes;
  if (ratio <= 1.5) return 3;
  if (ratio <= 3) return 2;
  return 1;
}

function starGlyphs(count) {
  let inner = "";
  for (let i = 0; i < 3; i++) inner += i < count ? "★" : '<span class="star-off">★</span>';
  return `<span class="stars">${inner}</span>`;
}

// How many keystrokes past "done" before the terminal nudges with an
// unprompted hint popup, and how often it repeats while still stuck.
const HINT_AFTER_EXTRA = 2;
const HINT_REPEAT_EVERY = 6;
const HINT_FALLBACK_TARGET = 10; // used for tasks with no targetKeystrokes

const FREEPLAY_PATH = "/home/user/practice/freeplay.txt";
const FREEPLAY_SEED = [
  "Свободный режим — никакой проверки, никаких заданий.",
  "",
  "Пробуйте что угодно: движения, dd/yy/p, visual mode, /поиск, :sort, :s/../../ ...",
  "Этот файл можно испортить как угодно — ничего не сломается, просто откройте",
  "свободный режим заново, чтобы начать с чистого листа.",
].join("\n");

export class TaskManager {
  constructor({ fs, terminal, els }) {
    this.fs = fs;
    this.terminal = terminal;
    this.els = els;
    this.activeTaskId = null;
    this.freeMode = false;
    this.doneStars = new Map(); // id -> 1|2|3
    this._hintShownAtKeystrokes = -Infinity;
    this._renderList();
    this._renderProgress();

    this.els.freeplayBtn?.addEventListener("click", () => this.openFreeMode());
  }

  openTask(id) {
    const task = TASKS.find((t) => t.id === id);
    if (!task) return;
    this.activeTaskId = id;
    this.freeMode = false;
    this._hintShownAtKeystrokes = -Infinity;
    this.terminal.hideInlineHint?.();
    this.fs.write(task.seed.path, task.seed.lines.join("\n"));
    this.terminal.enterVim(task.seed.path, { cursor: task.seed.cursor });
    this._renderList();
    this._renderDetail(task);
  }

  openFreeMode() {
    this.activeTaskId = null;
    this.freeMode = true;
    this.terminal.hideInlineHint?.();
    this.fs.write(FREEPLAY_PATH, FREEPLAY_SEED);
    this.terminal.enterVim(FREEPLAY_PATH, {});
    this._renderList();
    this._renderFreeModeDetail();
  }

  onVimKeystroke(state) {
    if (this.freeMode) return; // no checks, no hints — that's the point
    if (!this.activeTaskId) return;
    const task = TASKS.find((t) => t.id === this.activeTaskId);
    if (!task) return;
    const ok = task.check(state);
    this._updateStatus(task, state, ok);
    if (ok && !this.doneStars.has(task.id)) {
      const stars = computeStars(task, state);
      this.doneStars.set(task.id, stars);
      this._renderList();
      this._renderProgress();
      this._celebrate(stars);
      this.terminal.hideInlineHint?.();
      this._advanceToNextTask(task.id);
      return;
    }
    if (!ok) this._maybeShowInlineHint(task, state);
  }

  _maybeShowInlineHint(task, state) {
    const target = task.targetKeystrokes ?? HINT_FALLBACK_TARGET;
    const dueAt = target + HINT_AFTER_EXTRA;
    if (state.keystrokes < dueAt) return;
    if (state.keystrokes - this._hintShownAtKeystrokes < HINT_REPEAT_EVERY) return;
    this._hintShownAtKeystrokes = state.keystrokes;
    this.terminal.showInlineHint?.(task.hint);
  }

  _celebrate(stars) {
    const anchor = this._statusEl || this.els.taskDetail;
    burstStars(anchor, 10 + stars * 4);
    pulse(this._statusEl);
  }

  // A short pause so the star burst/pulse from _celebrate actually reads
  // as a reward for *this* task before the screen changes out from under
  // it — jumping instantly would make the celebration invisible.
  _advanceToNextTask(justCompletedId) {
    const idx = TASKS.findIndex((t) => t.id === justCompletedId);
    const next = TASKS[idx + 1];
    if (!next) return; // last task — nothing to advance to
    clearTimeout(this._advanceTimeout);
    this._advanceTimeout = setTimeout(() => {
      if (this.activeTaskId === justCompletedId) this.openTask(next.id);
    }, 1400);
  }

  _renderList() {
    const el = this.els.tasksList;
    el.innerHTML = "";
    if (this.els.freeplayBtn) {
      this.els.freeplayBtn.classList.toggle("active", this.freeMode);
    }
    for (const category of CATEGORY_ORDER) {
      const header = document.createElement("div");
      header.className = "task-category";
      header.textContent = category;
      el.appendChild(header);

      const grid = document.createElement("div");
      grid.className = "task-grid";
      let n = 0;
      for (const task of TASKS.filter((t) => t.category === category)) {
        n++;
        const stars = this.doneStars.get(task.id);
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className =
          "task-tile" +
          (task.id === this.activeTaskId ? " active" : "") +
          (stars ? " done" : "");
        tile.title = task.title;
        tile.innerHTML = stars
          ? `<span class="task-tile-check">✓</span>`
          : `<span class="task-tile-num">${n}</span>`;
        tile.addEventListener("click", () => this.openTask(task.id));
        grid.appendChild(tile);
      }
      el.appendChild(grid);
    }
  }

  _renderProgress() {
    const totalStars = [...this.doneStars.values()].reduce((a, b) => a + b, 0);
    this.els.progressSummary.textContent = `${this.doneStars.size} / ${TASKS.length} выполнено`;
    if (this.els.progressStars) {
      this.els.progressStars.textContent = totalStars > 0 ? `★ ${totalStars}` : "";
    }
  }

  _renderFreeModeDetail() {
    const el = this.els.taskDetail;
    el.innerHTML = "";
    const banner = document.createElement("div");
    banner.className = "freeplay-banner";
    banner.innerHTML =
      "🧪 <b>Свободный режим.</b> Никаких заданий и проверок — файл открыт просто чтобы тренироваться. " +
      "Перезайдите в этот режим кнопкой выше, чтобы начать с чистого листа.";
    el.appendChild(banner);
  }

  _renderDetail(task) {
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

    const stars = this.doneStars.get(task.id);
    const status = document.createElement("div");
    status.className = "task-status" + (stars ? " status-done" : " status-pending");
    status.innerHTML = stars ? `${starGlyphs(stars)} Выполнено!` : "Пока не выполнено";
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
      const stars = this.doneStars.get(task.id) ?? computeStars(task, state);
      this._statusEl.innerHTML = `${starGlyphs(stars)} Выполнено!`;
      this._statusEl.classList.add("status-done");
      this._statusEl.classList.remove("status-pending");
      popIn(this._statusEl);
    } else {
      this._statusEl.textContent = `Пока не выполнено (нажатий: ${state.keystrokes})`;
      this._statusEl.classList.remove("status-done");
      this._statusEl.classList.add("status-pending");
    }
  }
}
