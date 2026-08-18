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
  "echo",
  "rm",
  "cp",
  "mv",
  "head",
  "tail",
  "wc",
  "grep",
  "clear",
  "vim",
  "vi",
  "whoami",
  "hostname",
  "date",
  "uname",
  "uptime",
  "history",
  "w",
  "ps",
  "top",
  "du",
  "df",
  "man",
  "reboot",
  "shutdown",
  "help",
  "env",
  "printenv",
  "export",
  "unset",
  "hostnamectl",
  "lscpu",
  "ip",
];

const HELP_TEXT = [
  "Available commands:",
  "  ls [-la] [path]  list files (-l long, -a show . and ..)",
  "  ll [-a] [path]   list files, one per line, with permissions",
  "  cd [path]        change directory (no argument: home; '-': previous; '~': home)",
  "  pwd              print working directory",
  "  mkdir <name>     create a directory",
  "  touch <name>     create an empty file",
  "  cat <file>       print a file's contents",
  "  echo <text>      print text (supports > file / >> file)",
  "  head/tail <file> [-n N]  first/last N lines (default 10)",
  "  wc <file>        count lines/words/characters",
  "  grep <pat> <file> print lines containing pat",
  "  cp <src> <dst>   copy a file",
  "  mv <src> <dst>   move/rename a file",
  "  rm [-f] <file...> remove one or more files (supports * and ./* globs)",
  "  clear            clear the screen",
  "  vim / vi [file]  open a file in vim; no argument (or a directory)",
  "                   browses that directory so you can pick a file",
  "  whoami           print the current user",
  "  hostname         print the machine name",
  "  date             print the current date/time",
  "  uname [-a]       print system info",
  "  uptime           how long this session has been up",
  "  history          your command history",
  "  w                show who's logged in",
  "  ps               list running processes",
  "  top              a live view of CPU/memory usage, q to quit",
  "  du               disk usage of the current directory",
  "  df               filesystem usage",
  "  man <command>    a one-line manual entry",
  "  reboot           restart (shutdown + boot log, then reload)",
  "  shutdown [-h now|N]  power off (default: in 5s; N: in N seconds)",
  "  help             this message",
  "  env              print all environment variables",
  "  printenv [NAME]  print all, or one variable's value",
  "  export NAME=val  set an environment variable",
  "  unset NAME       remove an environment variable",
  "  hostnamectl [-l] system identity (host/OS/kernel); -l for more",
  "  lscpu            CPU info",
  "  ip a             list network interfaces",
  "",
  "Output redirection: `cmd > file` overwrites, `cmd >> file` appends.",
  "Tab completes commands, paths, and $NAME/${NAME} variables.",
  "Add --help (or -h) after any command for its manual entry.",
  "$NAME / ${NAME} expand to an environment variable's value anywhere",
  "in a command line; `NAME=value` on its own sets one.",
].join("\n");

// Keyed by exact command name (not fuzzy-parsed out of HELP_TEXT) so
// every alias (vim/vi) and multi-word entry (head/tail) resolves
// correctly — see the `man` case below.
const MAN_TEXT = {
  ls: "ls [-l] [-a|-A] [path] - list files (-l long format, -a/-A show . and ..)",
  ll: "ll [-a] [path] - list files, one per line, with permissions (-a shows . and ..)",
  cd: "cd [path] - change directory ('-': previous, '~'/no arg: home)",
  pwd: "pwd - print working directory",
  mkdir: "mkdir <name> - create a directory",
  touch: "touch <name> - create an empty file",
  cat: "cat <file> - print a file's contents",
  echo: "echo <text> - print text (supports > file / >> file)",
  head: "head <file> [-n N] - print the first N lines (default 10)",
  tail: "tail <file> [-n N] - print the last N lines (default 10)",
  wc: "wc <file> - count lines, words, and characters",
  grep: "grep <pattern> <file> - print lines containing pattern",
  cp: "cp <src> <dst> - copy a file",
  mv: "mv <src> <dst> - move/rename a file",
  rm: "rm [-f] <file...> - remove one or more files; * and ./* expand to a directory's entries, -f ignores missing files",
  clear: "clear - clear the screen",
  vim: "vim [file] - edit a file; no argument browses the current directory",
  vi: "vi [file] - alias for vim",
  whoami: "whoami - print the current user",
  hostname: "hostname - print the machine name",
  date: "date - print the current date and time",
  uname: "uname [-a] - print system information",
  uptime: "uptime - how long this session has been running",
  history: "history - list previously run commands",
  w: "w - show who's logged in and what they're running",
  ps: "ps - list running processes",
  top: "top - a live view of CPU/memory usage per process; press q to quit",
  du: "du - disk usage of the current directory",
  df: "df - filesystem usage summary",
  man: "man <command> - show a one-line manual entry",
  reboot: "reboot - restart: plays a shutdown + boot log, then reloads the page",
  shutdown: "shutdown [-h now|N] - power off; default in 5s, 'now' immediately, N in N seconds",
  help: "help - list all available commands",
  env: "env - print all environment variables as NAME=value",
  printenv: "printenv [NAME...] - print all variables, or just the named ones' values",
  export: "export NAME=value - set an environment variable ($NAME expands it afterwards)",
  unset: "unset NAME - remove an environment variable",
  hostnamectl: "hostnamectl [-l] - system identity (hostname/OS/kernel); -l for more fields",
  lscpu: "lscpu - CPU architecture info",
  ip: "ip a - list network interfaces and their addresses",
};

function tokenize(line) {
  return line.trim().split(/\s+/).filter(Boolean);
}

// `$NAME` and `${NAME}` expand to an environment variable's value
// anywhere in the line — applied once, up front, before tokenizing, so
// it works uniformly for command names, arguments, and redirect targets
// alike. An undefined variable expands to "" (matches real shells); `$5`
// or a bare trailing `$` isn't a valid name and is left untouched, same
// as `$5` being a positional parameter rather than `$NAME` in a real
// shell (we don't have positional parameters, so there's nothing to
// substitute there anyway).
function expandVars(text, fs) {
  return text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, braced, bare) => {
    const value = fs.getEnv(braced || bare);
    return value !== undefined ? value : "";
  });
}

const ASSIGN_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

// A line consisting only of `NAME=value` tokens (`FOO=bar`, or several
// at once — `A=1 B=2`) sets those variables directly, same shorthand as
// real bash's bare assignment (without the "run this one command with a
// temporary override" form real bash also supports — out of scope for
// this toy).
function isAssignmentLine(tokens) {
  return tokens.length > 0 && tokens.every((t) => ASSIGN_RE.test(t));
}

// Splits a `>`/`>>` redirect off the end of a token list, if present.
// Only the LAST `>`/`>>` in the line counts (matches real shells closely
// enough for a one-target redirect); returns the remaining tokens plus
// { append, target } or null.
function splitRedirect(tokens) {
  const idx = Math.max(tokens.lastIndexOf(">"), tokens.lastIndexOf(">>"));
  if (idx === -1) return { tokens, redirect: null };
  const op = tokens[idx];
  const target = tokens[idx + 1];
  if (!target) return { tokens: tokens.slice(0, idx), redirect: null };
  return { tokens: tokens.slice(0, idx), redirect: { append: op === ">>", target } };
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

// ---------- fake system stats shared by w / uptime / ps / top ----------

// Real elapsed time since the page loaded, presented as this session's
// "uptime" — the one honest number among all the invented ones below.
const SESSION_START = Date.now();

function fakeUptime() {
  const ms = Date.now() - SESSION_START;
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function fakeClock() {
  const d = new Date();
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
}

function fakeLoadAvg() {
  return [0, 0, 0].map(() => (Math.random() * 0.6 + 0.1).toFixed(2)).join(", ");
}

const FAKE_PROCESSES = [
  { pid: 1, user: "root", cmd: "systemd" },
  { pid: 118, user: "root", cmd: "sshd" },
  { pid: 342, user: "user", cmd: "bash" },
  { pid: 615, user: "user", cmd: "node" },
  { pid: 891, user: "user", cmd: "nginx" },
  { pid: 1024, user: "user", cmd: "vim" },
];

function randRange(min, max, digits = 1) {
  return (Math.random() * (max - min) + min).toFixed(digits);
}

function randHexId(len) {
  let s = "";
  for (let i = 0; i < len; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

// Rolled once per page load — machine-id and the network identity stay
// put for the whole session, same as a real machine that isn't being
// re-provisioned every command.
const MACHINE_ID = randHexId(32);
const BOOT_ID = randHexId(32);
const NET_OCTET = Math.floor(Math.random() * 200) + 20;
const FAKE_IP = `172.18.0.${NET_OCTET}`;
const FAKE_MAC = "02:42:ac:12:00:" + Math.floor(Math.random() * 256).toString(16).padStart(2, "0");

// Generates one fresh (fake) snapshot of top's display, as plain text
// lines — called once when `top` starts and then repeatedly by
// terminal.js's live-refresh interval, so every call must re-randomize
// (only fakeClock/fakeUptime are honestly time-based; everything else is
// freshly rolled dice each time, which is exactly what makes it "live").
export function renderTopSnapshot() {
  const cpuUser = randRange(1, 12);
  const cpuSys = randRange(0.2, 3);
  const cpuIdle = (100 - cpuUser - cpuSys).toFixed(1);
  const memTotal = 7943.1;
  const memUsed = Number(randRange(1800, 4200, 1));
  const lines = [
    `top - ${fakeClock()} up ${fakeUptime()}, 1 user, load average: ${fakeLoadAvg()}`,
    `Tasks: ${FAKE_PROCESSES.length + 3} total, 1 running, ${FAKE_PROCESSES.length + 2} sleeping, 0 stopped, 0 zombie`,
    `%Cpu(s): ${cpuUser} us, ${cpuSys} sy, 0.0 ni, ${cpuIdle} id, 0.1 wa, 0.0 hi, 0.0 si, 0.0 st`,
    `MiB Mem : ${memTotal.toFixed(1)} total, ${(memTotal - memUsed).toFixed(1)} free, ${memUsed.toFixed(1)} used, 1200.0 buff/cache`,
    `MiB Swap: 2048.0 total, 2048.0 free, 0.0 used. ${(memTotal - memUsed + 400).toFixed(1)} avail Mem`,
    "",
    "  PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND",
  ];
  for (const p of FAKE_PROCESSES) {
    const pcpu = randRange(0, p.cmd === "vim" ? 3 : 8);
    const pmem = randRange(0.1, 4);
    const virt = 40000 + p.pid * 130;
    const res = 4000 + p.pid * 20;
    lines.push(
      `${String(p.pid).padStart(5)} ${p.user.padEnd(8)}  20   0 ${String(virt).padStart(7)} ${String(res).padStart(6)}   ${String(
        Math.round(res * 0.6)
      ).padStart(5)} S ${String(pcpu).padStart(5)} ${String(pmem).padStart(5)}   0:0${p.pid % 6}.${p.pid % 90} ${p.cmd}`
    );
  }
  lines.push("", "(press q to quit)");
  return lines;
}

// `ls`/`ll` flag parsing — combined short flags (`-la`, `-al`, `-lA`),
// separate ones (`-l -a`), and the long forms all count; unknown long
// flags (`--color`, etc.) are silently accepted and ignored rather than
// erroring, same spirit as a real `ls` humoring flags it doesn't act on.
function parseLsFlags(args) {
  let long = false;
  let all = false;
  const paths = [];
  for (const a of args) {
    if (a === "--all") {
      all = true;
    } else if (a.startsWith("--")) {
      // ignore other long flags
    } else if (a.startsWith("-") && a.length > 1) {
      if (a.includes("l")) long = true;
      if (/[aA]/.test(a)) all = true;
    } else {
      paths.push(a);
    }
  }
  return { long, all, path: paths[0] };
}

// The actual command dispatch, redirect-unaware — `runCommand` below
// strips any `>`/`>>` before calling this and decides what to do with
// the output afterwards. `history` is the shell's own command log
// (terminal.js owns it — passed in rather than duplicated here) used
// only by the `history` command.
function executeCommand(fs, cmd, args, history) {
  const out = (text, cls = "") => ({ text, cls });

  // `--help`/`-h` on any known command short-circuits straight to its
  // manual entry, same as real coreutils — checked before the switch so
  // it works uniformly without every case needing to handle it itself.
  // `shutdown` is the one exception: real shutdown's `-h` means "halt",
  // not help, so it keeps only the long form.
  const wantsHelp = args.includes("--help") || (args.includes("-h") && cmd !== "shutdown");
  if (wantsHelp && MAN_TEXT[cmd]) {
    return { lines: [out(MAN_TEXT[cmd])], action: null };
  }

  try {
    switch (cmd) {
      case "help":
        return { lines: [out(HELP_TEXT)], action: null };

      case "pwd":
        return { lines: [out(fs.cwd)], action: null };

      case "whoami":
        return { lines: [out("user")], action: null };

      case "hostname":
        return { lines: [out("vimlab")], action: null };

      case "date": {
        const d = new Date();
        const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const two = (n) => String(n).padStart(2, "0");
        return {
          lines: [
            out(
              `${days[d.getDay()]} ${months[d.getMonth()]} ${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())} ${d.getFullYear()}`
            ),
          ],
          action: null,
        };
      }

      case "uname":
        return {
          lines: [
            out(
              args.includes("-a")
                ? "Linux vimlab 6.8.0-generic #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux"
                : "Linux"
            ),
          ],
          action: null,
        };

      case "uptime":
        return {
          lines: [out(`${fakeClock()} up ${fakeUptime()}, 1 user, load average: ${fakeLoadAvg()}`)],
          action: null,
        };

      case "history": {
        if (!history || history.length === 0) return { lines: [], action: null };
        return {
          lines: history.map((h, i) => out(`  ${String(i + 1).padStart(3)}  ${h}`)),
          action: null,
        };
      }

      case "echo":
        return { lines: [out(args.join(" "))], action: null };

      case "w":
        return {
          lines: [
            out(` ${fakeClock()} up ${fakeUptime()}, 1 user, load average: ${fakeLoadAvg()}`),
            out("USER     TTY      FROM         LOGIN@   IDLE   WHAT"),
            out(`user     pts/0    vimlab       now      0.00s  ${cmd}`),
          ],
          action: null,
        };

      case "ps": {
        const lines = [out("  PID TTY          TIME CMD")];
        for (const p of FAKE_PROCESSES.filter((p) => p.user === "user")) {
          lines.push(out(`${String(p.pid).padStart(5)} pts/0    00:00:0${p.pid % 6} ${p.cmd}`));
        }
        return { lines, action: null };
      }

      // Live/interactive — terminal.js owns the actual periodic
      // re-rendering (calling renderTopSnapshot() repeatedly) and the
      // "q quits and clears" behavior; this command itself just triggers
      // that mode instead of printing a one-shot snapshot.
      case "top":
        return { lines: [], action: { type: "top" } };

      case "du":
        return {
          lines: [out(`${(4 + fs.list(fs.cwd).length * 4).toFixed(0)}.0K\t.`)],
          action: null,
        };

      case "df":
        return {
          lines: [
            out("Filesystem     1K-blocks     Used Available Use% Mounted on"),
            out("/dev/sda1      102400000 45182364  52170112  47% /"),
            out("tmpfs            4071424        0   4071424   0% /dev/shm"),
          ],
          action: null,
        };

      case "hostnamectl": {
        const long = args.includes("-l") || args.includes("--all") || args.includes("-a");
        const lines = [
          out("   Static hostname: vimlab"),
          out("Transient hostname: vimlab"),
          out("         Icon name: computer-container"),
          out("           Chassis: container"),
          out("        Machine ID: " + MACHINE_ID),
          out("           Boot ID: " + BOOT_ID),
          out("    Virtualization: docker"),
          out("  Operating System: vimlab OS"),
          out("            Kernel: Linux 6.8.0-generic"),
          out("      Architecture: x86-64"),
        ];
        if (long) {
          lines.push(
            out("   Hardware Vendor: QEMU"),
            out("    Hardware Model: Standard PC (Q35 + ICH9, 2009)"),
            out("  Firmware Version: 1.16.3-2"),
            out("Firmware Vendor: EDK II")
          );
        }
        return { lines, action: null };
      }

      case "lscpu":
        return {
          lines: [
            out("Architecture:            x86_64"),
            out("CPU op-mode(s):          32-bit, 64-bit"),
            out("Byte Order:              Little Endian"),
            out("CPU(s):                  4"),
            out("On-line CPU(s) list:     0-3"),
            out("Vendor ID:               GenuineIntel"),
            out("Model name:              Intel(R) Core(TM) i7-9750H CPU @ 2.60GHz"),
            out("CPU family:              6"),
            out("Thread(s) per core:      2"),
            out("Core(s) per socket:      2"),
            out("Socket(s):               1"),
            out(`CPU MHz:                 ${randRange(1200, 2600, 0)}`),
            out("L1d cache:               32K"),
            out("L2 cache:                256K"),
            out("L3 cache:                12288K"),
          ],
          action: null,
        };

      case "ip": {
        if (args[0] === "a" || args[0] === "addr" || args[0] === "address") {
          return {
            lines: [
              out("1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN"),
              out("    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00"),
              out("    inet 127.0.0.1/8 scope host lo"),
              out("       valid_lft forever preferred_lft forever"),
              out("2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc noqueue state UP"),
              out(`    link/ether ${FAKE_MAC} brd ff:ff:ff:ff:ff:ff`),
              out(`    inet ${FAKE_IP}/24 brd 172.18.0.255 scope global eth0`),
              out("       valid_lft forever preferred_lft forever"),
            ],
            action: null,
          };
        }
        return { lines: [out(`Object "${args[0] ?? ""}" is unknown, try "ip help".`, "line-error")], action: null };
      }

      case "reboot":
        return { lines: [], action: { type: "reboot" } };

      case "shutdown": {
        const now = args.includes("now");
        const numArg = args.find((a) => /^\d+$/.test(a));
        const delaySec = now ? 0 : numArg ? parseInt(numArg, 10) : 5;
        return {
          lines: [out(delaySec === 0 ? "Shutdown NOW!" : `Shutdown scheduled, ${delaySec}s from now.`)],
          action: { type: "shutdown", delaySec },
        };
      }

      case "man": {
        if (!args[0]) return { lines: [out("What manual page do you want?", "line-error")], action: null };
        const entry = MAN_TEXT[args[0]];
        if (!entry) return { lines: [out(`No manual entry for ${args[0]}`, "line-error")], action: null };
        return { lines: [out(entry)], action: null };
      }

      case "env": {
        const lines = Object.entries(fs.listEnv())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => out(`${k}=${v}`));
        return { lines, action: null };
      }

      case "printenv": {
        const entries = fs.listEnv();
        if (args.length === 0) {
          const lines = Object.entries(entries)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => out(`${k}=${v}`));
          return { lines, action: null };
        }
        const lines = args.filter((name) => entries[name] !== undefined).map((name) => out(entries[name]));
        return { lines, action: null };
      }

      case "export": {
        if (args.length === 0) {
          const lines = Object.entries(fs.listEnv())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => out(`declare -x ${k}="${v}"`));
          return { lines, action: null };
        }
        for (const a of args) {
          const m = a.match(ASSIGN_RE);
          if (m) fs.env[m[1]] = m[2];
        }
        return { lines: [], action: null };
      }

      case "unset": {
        for (const name of args) delete fs.env[name];
        return { lines: [], action: null };
      }

      case "ls": {
        const { long, all, path } = parseLsFlags(args);
        const target = path ?? fs.cwd;
        const entries = fs.list(target, { all });
        if (entries.length === 0) return { lines: [], action: null };
        if (long) {
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
        const text = entries.map((e) => (e.type === "dir" ? e.name + "/" : e.name)).join("  ");
        return { lines: [out(text, "line-dir")], action: null };
      }

      case "ll": {
        const { all, path } = parseLsFlags(args);
        const target = path ?? fs.cwd;
        const entries = fs.list(target, { all });
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

      case "head":
      case "tail": {
        if (!args[0]) return { lines: [out(`${cmd}: missing operand`, "line-error")], action: null };
        let n = 10;
        const nIdx = args.indexOf("-n");
        const file = args.filter((a, i) => a !== "-n" && i !== nIdx + 1)[0] ?? args[args.length - 1];
        if (nIdx !== -1 && args[nIdx + 1]) n = parseInt(args[nIdx + 1], 10) || 10;
        const lines = fs.read(file).split("\n");
        const slice = cmd === "head" ? lines.slice(0, n) : lines.slice(-n);
        return { lines: slice.map((l) => out(l)), action: null };
      }

      case "wc": {
        if (!args[0]) return { lines: [out("wc: missing operand", "line-error")], action: null };
        const content = fs.read(args[0]);
        const lc = content === "" ? 0 : content.split("\n").length;
        const wc = content.trim() === "" ? 0 : content.trim().split(/\s+/).length;
        const cc = content.length;
        return {
          lines: [out(`${String(lc).padStart(7)} ${String(wc).padStart(7)} ${String(cc).padStart(7)} ${args[0]}`)],
          action: null,
        };
      }

      case "grep": {
        if (!args[1]) return { lines: [out("grep: missing operand", "line-error")], action: null };
        const [pattern, file] = args;
        const matches = fs
          .read(file)
          .split("\n")
          .filter((l) => l.includes(pattern));
        return { lines: matches.map((l) => out(l)), action: null };
      }

      case "cp": {
        if (!args[0] || !args[1]) return { lines: [out("cp: missing operand", "line-error")], action: null };
        fs.write(args[1], fs.read(args[0]));
        return { lines: [], action: null };
      }

      case "mv": {
        if (!args[0] || !args[1]) return { lines: [out("mv: missing operand", "line-error")], action: null };
        fs.write(args[1], fs.read(args[0]));
        fs.remove(args[0]);
        return { lines: [], action: null };
      }

      case "rm": {
        const flags = args.filter((a) => a.startsWith("-") && a !== "-");
        const paths = args.filter((a) => !a.startsWith("-") || a === "-");
        const force = flags.includes("--force") || flags.some((f) => !f.startsWith("--") && /f/i.test(f));
        if (paths.length === 0) return { lines: [out("rm: missing operand", "line-error")], action: null };

        // `*` / `./*` / `dir/*` — the one glob shell-ism worth supporting
        // since it's by far the most common actual use of `rm *`; no
        // general globbing engine, just this one trailing-star pattern.
        const errors = [];
        const expanded = [];
        for (const p of paths) {
          if (p === "*" || p === "/*" || p.endsWith("/*")) {
            const dirPart = p === "*" ? fs.cwd : p === "/*" ? "/" : fs.normalize(p.slice(0, -2));
            try {
              for (const entry of fs.list(dirPart)) {
                expanded.push((dirPart === "/" ? "" : dirPart) + "/" + entry.name);
              }
            } catch (err) {
              if (!force) errors.push(out(`rm: ${err.message}`, "line-error"));
            }
          } else {
            expanded.push(p);
          }
        }

        for (const p of expanded) {
          try {
            fs.remove(p);
          } catch (err) {
            if (!force) errors.push(out(`rm: ${err.message}`, "line-error"));
          }
        }
        return { lines: errors, action: null };
      }

      case "clear":
        return { lines: [], action: { type: "clear" } };

      case "vim":
      case "vi": {
        // No argument, or an explicit '.', browses the current directory
        // rather than editing anything — same idea as real vim's netrw
        // (`vim .`), just without a real vim's full file-explorer.
        const target = !args[0] || args[0] === "." ? fs.cwd : fs.normalize(args[0]);
        if (fs.exists(target) && fs.isDir(target)) {
          return { lines: [], action: { type: "browse", path: target } };
        }
        if (!args[0]) return { lines: [], action: { type: "browse", path: fs.cwd } };
        if (!fs.exists(target)) fs.touch(target);
        return { lines: [], action: { type: "vim", path: target } };
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

// Returns { lines: [{text, cls}], action }
// action is null, { type: "clear" }, { type: "vim", path },
// { type: "browse", path } (vim/vi with no file — see executeCommand),
// { type: "top" } (live snapshot mode, see renderTopSnapshot + terminal.js),
// { type: "reboot" } (immediate page reload), { type: "shutdown", delaySec }
// (power-off theater, see terminal.js's shutdown/boot sequence — does NOT
// reload the page, so unlike reboot the in-memory fs survives it),
// { type: "meltdown" } (rm -rf / — errors first, see looksLikeRmRfRoot
// above), or { type: "meltdown-image" } (sudo — no error phase, straight
// to the picture).
export function runCommand(fs, rawLine, { history } = {}) {
  // Expanded once, up front, so $NAME/${NAME} works uniformly in the
  // command name, any argument, or a redirect target — everything below
  // just sees the already-substituted text.
  const line = expandVars(rawLine.trim(), fs);
  if (!line) return { lines: [], action: null };

  const rawTokens = tokenize(line);
  const out = (text, cls = "") => ({ text, cls });

  if (isAssignmentLine(rawTokens)) {
    for (const t of rawTokens) {
      const m = t.match(ASSIGN_RE);
      fs.env[m[1]] = m[2];
    }
    return { lines: [], action: null };
  }

  if (rawTokens[0] === "rm" && looksLikeRmRfRoot(fs, rawTokens.slice(1))) {
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

  if (rawTokens[0] === "sudo") {
    return {
      lines: [out("user is not in the sudoers file. This incident will be reported.", "line-error")],
      action: { type: "meltdown-image" },
    };
  }

  const { tokens, redirect } = splitRedirect(rawTokens);
  const [cmd, ...args] = tokens;
  const result = executeCommand(fs, cmd, args, history);

  if (!redirect) return result;

  // Only redirect genuine stdout — a command that errored keeps its
  // error visible in the terminal instead of silently vanishing into
  // the target file (rough stdout/stderr distinction: error-styled
  // lines never redirect).
  const hasError = result.lines.some((l) => l.cls && l.cls.includes("line-error"));
  if (hasError) return result;

  try {
    const text = result.lines.map((l) => l.text).join("\n");
    const targetPath = fs.normalize(redirect.target);
    const existing = redirect.append && fs.exists(targetPath) ? fs.read(targetPath) : "";
    fs.write(targetPath, existing + (existing ? "\n" : "") + text);
    return { lines: [], action: result.action };
  } catch (err) {
    if (err instanceof FsError) {
      return { lines: [out(`${cmd}: ${err.message}`, "line-error")], action: null };
    }
    throw err;
  }
}
