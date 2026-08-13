// Electron main process. Run with `npx electron .` after `npm run build`.
const { app, BrowserWindow, utilityProcess } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

let serverProcess;

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

  // Load the locally spawned Nitro Node.js server
  win.loadURL("http://localhost:3000");
}

app.whenReady().then(() => {
  // Determine if we are running from source or packaged
  let baseDir = __dirname;
  if (baseDir.includes('app.asar')) {
    baseDir = path.join(app.getAppPath());
  } else {
    baseDir = path.join(__dirname, "..");
  }

  const serverPath = path.join(baseDir, ".output", "server", "index.mjs");
  
  if (!fs.existsSync(serverPath)) {
    console.error("Server path not found:", serverPath);
  }

  // Fork the Node backend using Electron's built-in Node
  serverProcess = utilityProcess.fork(serverPath, [], {
    env: { 
      ...process.env, 
      PORT: "3000",
      RESOURCES_PATH: process.resourcesPath || ""
    }
  });

  serverProcess.on("message", (msg) => {
    console.log("Server message:", msg);
  });

  // Wait 1.5s for the Nitro server to boot up, then load the window
  setTimeout(createWindow, 1500);
});

app.on("window-all-closed", () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) serverProcess.kill();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
