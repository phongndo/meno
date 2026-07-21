import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";

export const createMainWindow = async (): Promise<BrowserWindow> => {
  const window = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    backgroundColor: "#ffffff",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: fileURLToPath(new URL("../../preload/index.cjs", import.meta.url)),
      sandbox: true,
    },
  });

  window.once("ready-to-show", () => window.show());
  await window.loadFile(fileURLToPath(new URL("../../renderer/index.html", import.meta.url)));
  return window;
};
