import { app, BrowserWindow } from "electron";

import { createMainWindow } from "./window/createMainWindow.js";

let mainWindow: BrowserWindow | undefined;

const openMainWindow = async (): Promise<void> => {
  mainWindow = await createMainWindow();
  mainWindow.once("closed", () => {
    mainWindow = undefined;
  });
};

app.whenReady().then(async () => {
  await openMainWindow();

  app.on("activate", () => {
    if (!mainWindow) void openMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
