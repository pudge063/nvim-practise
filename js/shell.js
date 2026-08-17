// Shell command interpreter — deliberately small (see README "Что внутри").
import { FsError } from "./filesystem.js";

const HELP_TEXT = [
  "Доступные команды:",
  "  ls [путь]        — список файлов",
  "  cd [путь]        — сменить каталог (без аргумента — домой)",
  "  pwd              — текущий каталог",
  "  mkdir <имя>      — создать каталог",
  "  touch <имя>      — создать пустой файл",
  "  cat <файл>       — показать содержимое файла",
  "  rm <файл>        — удалить файл",
  "  clear            — очистить экран",
  "  vim <файл>       — открыть файл в vim (Esc не нужен — сразу Normal mode)",
  "  help             — эта справка",
].join("\n");

function tokenize(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

// Returns { lines: [{text, cls}], action }
// action is null, or { type: "clear" }, or { type: "vim", path }
export function runCommand(fs, rawLine) {
  const line = rawLine.trim();
  if (!line) return { lines: [], action: null };

  const [cmd, ...args] = tokenize(line);
  const out = (text, cls = "") => ({ text, cls });

  try {
    switch (cmd) {
      case "help":
        return { lines: [out(HELP_TEXT)], action: null };

      case "pwd":
        return { lines: [out(fs.cwd)], action: null };

      case "ls": {
        const target = args[0] ?? fs.cwd;
        const entries = fs.list(target);
        if (entries.length === 0) return { lines: [], action: null };
        const text = entries
          .map((e) => (e.type === "dir" ? e.name + "/" : e.name))
          .join("  ");
        return { lines: [out(text, "line-dir")], action: null };
      }

      case "cd": {
        const target = args[0] ?? "/home/user";
        fs.chdir(target);
        return { lines: [], action: null };
      }

      case "mkdir": {
        if (!args[0]) return { lines: [out("mkdir: укажите имя каталога", "line-error")], action: null };
        fs.mkdir(args[0]);
        return { lines: [], action: null };
      }

      case "touch": {
        if (!args[0]) return { lines: [out("touch: укажите имя файла", "line-error")], action: null };
        fs.touch(args[0]);
        return { lines: [], action: null };
      }

      case "cat": {
        if (!args[0]) return { lines: [out("cat: укажите имя файла", "line-error")], action: null };
        const content = fs.read(args[0]);
        return { lines: [out(content === "" ? "(пустой файл)" : content)], action: null };
      }

      case "rm": {
        if (!args[0]) return { lines: [out("rm: укажите имя файла", "line-error")], action: null };
        fs.remove(args[0]);
        return { lines: [], action: null };
      }

      case "clear":
        return { lines: [], action: { type: "clear" } };

      case "vim": {
        if (!args[0]) return { lines: [out("vim: укажите имя файла", "line-error")], action: null };
        const path = fs.normalize(args[0]);
        if (fs.exists(path) && fs.isDir(path)) {
          return { lines: [out(`vim: это каталог: ${args[0]}`, "line-error")], action: null };
        }
        if (!fs.exists(path)) fs.touch(path);
        return { lines: [], action: { type: "vim", path } };
      }

      default:
        return { lines: [out(`команда не найдена: ${cmd} (наберите help)`, "line-error")], action: null };
    }
  } catch (err) {
    if (err instanceof FsError) {
      return { lines: [out(`${cmd}: ${err.message}`, "line-error")], action: null };
    }
    throw err;
  }
}
