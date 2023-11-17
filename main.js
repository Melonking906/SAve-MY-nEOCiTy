const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require("electron");
const storage = require("electron-json-storage");
const fs = require("fs-extra");
const path = require("path");

const downloader = require("./download.js");
let mainWindow = undefined;

const createMainWindow = (titleBarStyle) => {
    mainWindow = new BrowserWindow({
        width: 420,
        height: 800,
        titleBarStyle: titleBarStyle,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.loadFile("ui/index.html");
    //mainWindow.webContents.openDevTools();
};

app.whenReady().then(() => {
    // Menu Bar
    let menuTemplate = [
        { label: app.name, submenu: [{ label: "About", role: "about" }, { type: "separator" }, { label: "Quit", role: "quit" }] },
        {
            label: "Edit",
            submenu: [
                {
                    label: "Undo",
                    accelerator: "CmdOrCtrl+Z",
                    selector: "undo:",
                },
                {
                    label: "Redo",
                    accelerator: "Shift+CmdOrCtrl+Z",
                    selector: "redo:",
                },
                {
                    type: "separator",
                },
                {
                    label: "Copy",
                    accelerator: "CmdOrCtrl+C",
                    selector: "copy:",
                },
                {
                    label: "Paste",
                    accelerator: "CmdOrCtrl+V",
                    selector: "paste:",
                },
                {
                    label: "Select All",
                    accelerator: "CmdOrCtrl+A",
                    selector: "selectAll:",
                },
            ],
        },
        {
            label: "Help",
            submenu: [
                {
                    label: "Visit the Wiki",
                    click: function () {
                        shell.openExternal("https://wiki.melonland.net/save_my_neocity");
                    },
                },
                {
                    label: "Visit the Forum Thread",
                    click: function () {
                        shell.openExternal("https://forum.melonland.net/index.php?topic=2088");
                    },
                },
                {
                    label: "Visit the Info Page",
                    click: function () {
                        shell.openExternal("https://melonking.net/melon?z=/free/software/gallery-maker");
                    },
                },
                {
                    label: "Email Me!",
                    click: function () {
                        shell.openExternal("mailto:webmaster@melonking.net?subject=GalleryMakerSupport");
                    },
                },
            ],
        },
    ];
    Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

    // Other cosmetic stuff
    app.setAppUserModelId(app.name);

    // Update version number
    storage.set("version", app.getVersion());

    // Windows - macs get cool hidden windows
    if (process.platform == "darwin") {
        createMainWindow("hidden");
    } else {
        createMainWindow("");
    }

    // +++ Events +++

    // Open a window if none exist
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });

    // Quit when all windows are closed, except on mac
    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });

    // Startup load memory
    mainWindow.webContents.once("dom-ready", () => {
        storage.has("save", function (error, hasKey) {
            if (hasKey) {
                savePathUpdate(storage.getSync("save"));
            }
        });
    });

    // +++ Events +++

    ipcMain.on("open-save-picker", (event) => {
        dialog
            .showOpenDialog({
                title: "Select a folder to save to!",
                button: "Pick!",
                properties: ["openDirectory", "createDirectory"],
            })
            .then((result) => {
                let path = result.filePaths[0];
                if (path == undefined) {
                    // The picker was closed without selecting anything
                    return;
                }
                savePathUpdate(path);
                storage.set("save", path);
            })
            .catch((err) => {
                console.log(err);
            });
    });

    ipcMain.on("do-download", (event, downloadData) => {
        downloader.go(downloadData, (results) => {
            event.sender.send("download-done", results);
        });
    });

    ipcMain.on("stop-download", (event, downloadData) => {
        downloader.stop();
    });

    ipcMain.on("get-download-status", (event) => {
        event.sender.send("download-status-update", downloader.getStatus());
    });

    // +++ GENERAL

    ipcMain.on("get-storage-path", (event) => {
        event.sender.send("data-request", storage.getDataPath());
    });
});

// ++++ Functions ++++

function savePathUpdate(savePath) {
    fs.readdir(savePath, function (err, fileNames) {
        if (err) {
            mainWindow.webContents.send("save-selected-error");
            return console.log("Unable to scan directory: " + err);
        }

        fileNames = fileNames.filter((item) => !/(^|\/)\.[^\/\.]/g.test(item)); // Remove hidden files
        if (fileNames.length > 0) {
            // Not empty
            mainWindow.webContents.send("save-selected", savePath, false);
        } else {
            // Empty
            mainWindow.webContents.send("save-selected", savePath, true);
        }
    });
}
