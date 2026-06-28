// Electron main process. Run with `npx electron .` after `npm run build`.
// CommonJS because package.json has "type": "module".
const { app, BrowserWindow } = require("electron");
const path = require("node:path");

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0D0F14",
    title: "StudyVault",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexHtml = path.join(__dirname, "..", "dist", "client", "index.html");
  win.loadFile(indexHtml);
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
