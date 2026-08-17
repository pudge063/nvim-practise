// In-memory virtual filesystem — see docs/adr/0002-virtual-filesystem.md
// for why this exists and why it doesn't persist across reloads.

function dir(children = {}) {
  return { type: "dir", children };
}

function file(content = "") {
  return { type: "file", content };
}

// Starting layout every fresh page load gets.
function seedTree() {
  return dir({
    home: dir({
      user: dir({
        "welcome.txt": file(
          [
            "Добро пожаловать в vimquest!",
            "",
            "Это обычный терминал: ls, cd, mkdir, touch, cat, rm тут работают.",
            "Откройте vim командой:",
            "",
            "  vim welcome.txt",
            "",
            "Выйти из vim: :q  (или :wq, если что-то поменяли и хотите сохранить)",
            "",
            "Задания — в панели справа. Каждое задание само подставит",
            "нужный файл, когда вы его откроете.",
          ].join("\n")
        ),
        practice: dir({}),
      }),
    }),
  });
}

export class FileSystem {
  constructor() {
    this.root = seedTree();
    this.cwd = "/home/user";
  }

  // --- path handling ---

  normalize(path) {
    if (path === "~") path = "/home/user";
    else if (path.startsWith("~/")) path = "/home/user/" + path.slice(2);
    const abs = path.startsWith("/") ? path : this.cwd + "/" + path;
    const parts = abs.split("/").filter(Boolean);
    const out = [];
    for (const part of parts) {
      if (part === ".") continue;
      if (part === "..") out.pop();
      else out.push(part);
    }
    return "/" + out.join("/");
  }

  splitParent(path) {
    const norm = this.normalize(path);
    const idx = norm.lastIndexOf("/");
    return { parentPath: idx === 0 ? "/" : norm.slice(0, idx), name: norm.slice(idx + 1) };
  }

  resolveNode(path) {
    const norm = this.normalize(path);
    if (norm === "/") return this.root;
    const parts = norm.split("/").filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      if (!node || node.type !== "dir" || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  }

  exists(path) {
    return this.resolveNode(path) !== null;
  }

  isDir(path) {
    const node = this.resolveNode(path);
    return !!node && node.type === "dir";
  }

  isFile(path) {
    const node = this.resolveNode(path);
    return !!node && node.type === "file";
  }

  // --- operations ---

  list(path = this.cwd) {
    const node = this.resolveNode(path);
    if (!node) throw new FsError(`нет такого файла или каталога: ${path}`);
    if (node.type !== "dir") throw new FsError(`не каталог: ${path}`);
    return Object.entries(node.children)
      .map(([name, n]) => ({ name, type: n.type }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  }

  chdir(path) {
    const norm = this.normalize(path);
    if (!this.exists(norm)) throw new FsError(`нет такого каталога: ${path}`);
    if (!this.isDir(norm)) throw new FsError(`не каталог: ${path}`);
    this.cwd = norm;
    return norm;
  }

  mkdir(path) {
    const { parentPath, name } = this.splitParent(path);
    if (!name) throw new FsError("укажите имя каталога");
    const parent = this.resolveNode(parentPath);
    if (!parent || parent.type !== "dir") throw new FsError(`нет такого каталога: ${parentPath}`);
    if (parent.children[name]) throw new FsError(`уже существует: ${name}`);
    parent.children[name] = dir();
  }

  touch(path) {
    const { parentPath, name } = this.splitParent(path);
    if (!name) throw new FsError("укажите имя файла");
    const parent = this.resolveNode(parentPath);
    if (!parent || parent.type !== "dir") throw new FsError(`нет такого каталога: ${parentPath}`);
    if (!parent.children[name]) parent.children[name] = file("");
  }

  read(path) {
    const node = this.resolveNode(path);
    if (!node) throw new FsError(`нет такого файла: ${path}`);
    if (node.type !== "file") throw new FsError(`это каталог: ${path}`);
    return node.content;
  }

  write(path, content) {
    const { parentPath, name } = this.splitParent(path);
    const parent = this.resolveNode(parentPath);
    if (!parent || parent.type !== "dir") throw new FsError(`нет такого каталога: ${parentPath}`);
    if (parent.children[name] && parent.children[name].type === "dir") {
      throw new FsError(`это каталог: ${path}`);
    }
    parent.children[name] = file(content);
  }

  remove(path) {
    const { parentPath, name } = this.splitParent(path);
    const parent = this.resolveNode(parentPath);
    if (!parent || !parent.children[name]) throw new FsError(`нет такого файла: ${path}`);
    delete parent.children[name];
  }

  // path shown in prompts, with $HOME collapsed to ~
  displayPath(path = this.cwd) {
    const norm = this.normalize(path);
    if (norm === "/home/user") return "~";
    if (norm.startsWith("/home/user/")) return "~" + norm.slice("/home/user".length);
    return norm;
  }
}

export class FsError extends Error {}
