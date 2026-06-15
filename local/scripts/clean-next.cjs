const fs = require("node:fs");

const removeOptions = {
  recursive: true,
  force: true,
  maxRetries: process.platform === "win32" ? 30 : 3,
  retryDelay: process.platform === "win32" ? 200 : 100,
};

function isBusyError(error) {
  return error && ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error.code);
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function backupName(date = new Date()) {
  return [
    ".next.bak-",
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function removeDistDir(distDir) {
  try {
    fs.rmSync(distDir, removeOptions);
    return;
  } catch (error) {
    if (process.platform !== "win32" || !isBusyError(error)) throw error;
    if (distDir !== ".next") {
      console.warn(`[clean-next] skipped locked backup directory ${distDir}`);
      return;
    }
    const fallback = backupName();
    fs.renameSync(distDir, fallback);
    console.warn(`[clean-next] moved locked .next to ${fallback}; it will be removed on a later clean run.`);
  }
}

const distDirs = [
  ".next",
  ...fs.readdirSync(process.cwd(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\.next\.bak-\d{8}-\d{6}$/.test(entry.name))
    .map((entry) => entry.name),
];

for (const distDir of distDirs) {
  if (!fs.existsSync(distDir)) continue;
  removeDistDir(distDir);
}
