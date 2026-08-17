// Shell command interpreter — deliberately small (see README "What's inside").
// All user-facing text here is English on purpose, matching a real Unix
// shell's own output — the Russian-language teaching content lives in the
// tasks panel (tasks.js), not in the simulated terminal itself.
import { FsError } from "./filesystem.js";

export const COMMAND_NAMES = [
  "ls",
  "ll",
  "cd",
  "pwd",
  "mkdir",
  "touch",
  "cat",
  "rm",
  "clear",
  "vim",
  "whoami",
  "w",
  "reboot",
  "sudo",
  "help",
];

const HELP_TEXT = [
  "Available commands:",
  "  ls [path]        list files",
  "  ll [path]        list files, one per line, with fake permissions",
  "  cd [path]        change directory (no argument: home; '-': previous; '~': home)",
  "  pwd              print working directory",
  "  mkdir <name>     create a directory",
  "  touch <name>     create an empty file",
  "  cat <file>       print a file's contents",
  "  rm <file>        remove a file",
  "  clear            clear the screen",
  "  vim <file>       open a file in vim (starts in Normal mode)",
  "  whoami           print the current user",
  "  w                show who's logged in",
  "  reboot           reload the page",
  "  help             this message",
  "",
  "Tab completes commands and paths, like a real shell.",
].join("\n");

function tokenize(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

// `rm -rf /` (and the usual near-spellings of it) is the one command
// every terminal-flavored toy is expected to have an opinion about. This
// is a fake filesystem, so it was never going to delete anything real —
// the "meltdown" is purely theatrical (see terminal.js's `meltdown`
// action), same spirit as e.g. `sl` in a real shell.
//
// -r/-f detection is permissive by design: any short flag containing
// 'r' counts toward recursive and any containing 'f' toward force
// (case-insensitive, so -R counts too), in addition to the long forms —
// covers -rf, -fr, -Rf, -r -f, -r --force, --recursive -f, etc. without
// enumerating every ordering by hand.
function isRecursiveForce(flags) {
  const hasR = flags.includes("--recursive") || flags.some((f) => !f.startsWith("--") && /r/i.test(f));
  const hasF = flags.includes("--force") || flags.some((f) => !f.startsWith("--") && /f/i.test(f));
  return hasR && hasF;
}

// A path "targets root" if it literally IS root (after resolving
// ./.. and symlink-free normalization), or if it's a glob over root's
// contents (`/*`, no real globbing engine here so these are just
// recognized as literal tokens), or if it's a bare `*` while sitting
// in `/` itself (`cd /; rm -rf *`).
function targetsRoot(fs, path) {
  if (path === "*") return fs.cwd === "/";
  if (path === "/*" || path === "/**") return true;
  return fs.normalize(path) === "/";
}

function looksLikeRmRfRoot(fs, args) {
  const flags = args.filter((a) => a.startsWith("-"));
  const paths = args.filter((a) => !a.startsWith("-"));
  return isRecursiveForce(flags) && paths.some((p) => targetsRoot(fs, p));
}

const FAKE_PERMS = { dir: "drwxr-xr-x", file: "-rw-r--r--" };

// Returns { lines: [{text, cls}], action }
// action is null, { type: "clear" }, { type: "vim", path },
// { type: "reboot" }, { type: "meltdown" } (rm -rf / — errors first, see
// looksLikeRmRfRoot above), or { type: "meltdown-image" } (sudo — no
// error phase, straight to the picture).
export function runCommand(fs, rawLine) {
  const line = rawLine.trim();
  if (!line) return { lines: [], action: null };

  const [cmd, ...args] = tokenize(line);
  const out = (text, cls = "") => ({ text, cls });

  if (cmd === "rm" && looksLikeRmRfRoot(fs, args)) {
    return {
      lines: [
        out("rm: descending into '/'"),
        out("rm: removing '/bin'"),
        out("rm: removing '/etc'"),
        out("rm: fatal filesystem error", "line-error"),
      ],
      action: { type: "meltdown" },
    };
  }

  if (cmd === "sudo") {
    return {
      lines: [out("user is not in the sudoers file. This incident will be reported.", "line-error")],
      action: { type: "meltdown-image" },
    };
  }

  try {
    switch (cmd) {
      case "help":
        return { lines: [out(HELP_TEXT)], action: null };

      case "pwd":
        return { lines: [out(fs.cwd)], action: null };

      case "whoami":
        return { lines: [out("user")], action: null };

      case "w":
        return {
          lines: [
            out(" up 0 days, 1 user, load average: 0.00, 0.00, 0.00"),
            out("USER     TTY      FROM         LOGIN@   IDLE   WHAT"),
            out(`user     pts/0    vimquest     now      0.00s  ${cmd}`),
          ],
          action: null,
        };

      case "reboot":
        return { lines: [out("Rebooting...")], action: { type: "reboot" } };

      case "ls": {
        const target = args[0] ?? fs.cwd;
        const entries = fs.list(target);
        if (entries.length === 0) return { lines: [], action: null };
        const text = entries.map((e) => (e.type === "dir" ? e.name + "/" : e.name)).join("  ");
        return { lines: [out(text, "line-dir")], action: null };
      }

      case "ll": {
        const target = args[0] ?? fs.cwd;
        const entries = fs.list(target);
        if (entries.length === 0) return { lines: [], action: null };
        return {
          lines: entries.map((e) =>
            out(
              `${FAKE_PERMS[e.type]}  ${e.type === "dir" ? e.name + "/" : e.name}`,
              e.type === "dir" ? "line-dir" : ""
            )
          ),
          action: null,
        };
      }

      case "cd": {
        let cdArgs = args[0] === "--" ? args.slice(1) : args;
        let target = cdArgs[0] ?? "/home/user";
        if (target === "-") {
          target = fs.prevCwd;
          fs.chdir(target);
          return { lines: [out(fs.displayPath(target))], action: null };
        }
        fs.chdir(target);
        return { lines: [], action: null };
      }

      case "mkdir": {
        if (!args[0]) return { lines: [out("mkdir: missing operand", "line-error")], action: null };
        fs.mkdir(args[0]);
        return { lines: [], action: null };
      }

      case "touch": {
        if (!args[0]) return { lines: [out("touch: missing operand", "line-error")], action: null };
        fs.touch(args[0]);
        return { lines: [], action: null };
      }

      case "cat": {
        if (!args[0]) return { lines: [out("cat: missing operand", "line-error")], action: null };
        const content = fs.read(args[0]);
        return { lines: [out(content === "" ? "" : content)], action: null };
      }

      case "rm": {
        if (!args[0]) return { lines: [out("rm: missing operand", "line-error")], action: null };
        fs.remove(args[0]);
        return { lines: [], action: null };
      }

      case "clear":
        return { lines: [], action: { type: "clear" } };

      case "vim": {
        if (!args[0]) return { lines: [out("vim: missing operand", "line-error")], action: null };
        const path = fs.normalize(args[0]);
        if (fs.exists(path) && fs.isDir(path)) {
          return { lines: [out(`vim: Is a directory: ${args[0]}`, "line-error")], action: null };
        }
        if (!fs.exists(path)) fs.touch(path);
        return { lines: [], action: { type: "vim", path } };
      }

      default:
        return { lines: [out(`command not found: ${cmd} (try 'help')`, "line-error")], action: null };
    }
  } catch (err) {
    if (err instanceof FsError) {
      return { lines: [out(`${cmd}: ${err.message}`, "line-error")], action: null };
    }
    throw err;
  }
}
