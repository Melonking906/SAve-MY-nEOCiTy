const { ipcRenderer, shell } = require("electron");
const storage = require("electron-json-storage");
const { DateTime } = require("luxon");
const path = require("path");

const index = {};

index.storagePath = "";

index.html = {};
index.html.version = document.getElementById("version");
index.html.user = document.getElementById("user");
index.html.pass = document.getElementById("pass");
index.html.path_pick = document.getElementById("path_pick");
index.html.path_feedback = document.getElementById("path_feedback");
index.html.do_timestamp = document.getElementById("do_timestamp");
index.html.do_zip = document.getElementById("do_zip");
index.html.plan_feedback = document.getElementById("plan_feedback");
index.html.button_save = document.getElementById("button_save");
index.html.button_stop = document.getElementById("button_stop");
index.html.button_save_feedback = document.getElementById("button_save_feedback");
index.html.log = document.getElementById("log");

index.path = undefined;
index.calculatedPath = undefined;
index.pathIsEmpty = true;

index.isRunning = false;

ipcRenderer.send("get-storage-path");

ipcRenderer.on("data-request", (event, data) => {
    index.storagePath = data;
    start();
});

index.html.path_pick.addEventListener("click", () => {
    ipcRenderer.send("open-save-picker");
});

index.html.do_timestamp.addEventListener("click", calculatePath);
index.html.do_zip.addEventListener("click", calculatePath);
index.html.user.addEventListener("keyup", calculatePath);

index.html.button_save.addEventListener("click", () => {
    let user = index.html.user.value.trim();
    let pass = index.html.pass.value;

    if (index.html.user.value == "" || index.html.pass == "") {
        index.html.button_save_feedback.innerHTML = "Please enter your neocities login info!";
        return;
    }

    calculatePath();

    if (index.path == undefined || index.calculatedPath == undefined) {
        index.html.button_save_feedback.innerHTML = "Please pick a folder to save to!";
        return;
    }

    storage.set("neocities_user", user);
    storage.set("do_zip", index.html.do_zip.checked);
    storage.set("do_timestamp", index.html.do_timestamp.checked);

    let downloadData = {};
    downloadData.path = index.calculatedPath;
    downloadData.user = user;
    downloadData.pass = pass;
    downloadData.do_zip = index.html.do_zip.checked;

    setInputs(true);
    ipcRenderer.send("do-download", JSON.stringify(downloadData));
    index.isRunning = true;
    index.html.button_save_feedback.innerHTML = "Saving your site!! Zoosh <img src='images/work-0082.gif' /> (This may take a while!)";
    audio.loading.play();

    index.html.button_save.style.display = "none";
    index.html.button_stop.style.display = "block";
});

index.html.button_stop.addEventListener("click", () => {
    ipcRenderer.send("stop-download");

    index.html.button_save.style.display = "block";
    index.html.button_stop.style.display = "none";
    index.html.button_save_feedback.innerHTML = "STOP! - You stopped it!!";
    index.html.log.innerHTML = "Status: Not Running";
    audio.loading.pause();
    return;
});

ipcRenderer.on("save-selected", (event, path, isEmpty) => {
    index.html.path_feedback.innerHTML = "You picked: <b>" + path + "</b> !!!";
    if (!isEmpty) {
        index.html.path_feedback.innerHTML += "<br><b>NOTE this folder is not empty, are you sure its ok?</b>";
    }
    index.path = path;
    index.pathIsEmpty = isEmpty;
    calculatePath();
});

setInterval(() => {
    if (index.isRunning) {
        ipcRenderer.send("get-download-status");
    }
}, 1000);

ipcRenderer.on("download-status-update", (event, status) => {
    let msg = "";
    if (status.stage > 0) {
        msg = "Stage " + status.stage + " " + status.percentage + "% : Files: " + status.downloaded + " of " + status.goal + " \nDownloaded: " + (status.downloaded_size / 1000 / 1000).toFixed(2) + "mb of " + (status.total_size / 1000 / 1000).toFixed(2) + "mb\n";
        let timeInSeconds = (status.time / 1000).toFixed(2);
        if (timeInSeconds > 60) {
            msg += "Estimated time is " + (timeInSeconds / 60).toFixed(2) + " minutes!";
        } else {
            msg += "Estimated time is " + timeInSeconds + " seconds!";
        }
        if (status.percentage > 80) {
            msg += "\n(If the download freezes, don't worry, wait for big files to finish!)";
        }
    } else {
        msg = "Status: Getting ready!";
    }
    index.html.log.innerHTML = msg;
});

ipcRenderer.on("download-done", (event, results) => {
    index.isRunning = false;
    setInputs(false);

    if (results.result == "fail") {
        index.html.button_save.style.display = "block";
        index.html.button_stop.style.display = "none";
        index.html.button_save_feedback.innerHTML = "NOPE! - Oh no, something went wrong, was your password correct?";
        index.html.log.innerHTML = "Status: Not Running";
        audio.loading.pause();
        audio.error.play();
        return;
    }

    let msg = "Files Found: " + results.counts.found + " \nFiles Downloaded: " + results.counts.downloaded + "\nSize of Site: " + (results.counts.downloaded_size / 1000 / 1000).toFixed(2) + "mb \nFiles Failed: " + results.counts.failed;
    if (results.counts.failed > 0) {
        msg += "\nFailed Files:";
        results.files.failed.forEach((file) => {
            msg += "\n" + file;
        });
    }
    index.html.log.innerHTML = msg;
    index.html.button_save_feedback.innerHTML = "The save is DONE !!! <img src='images/party-0781.gif' />";
    audio.loading.pause();
    audio.success.play();

    index.html.button_save.style.display = "block";
    index.html.button_stop.style.display = "none";
});

function start() {
    storage.setDataPath(index.storagePath);
    index.html.version.innerHTML = "v" + storage.getSync("version");
    storage.has("neocities_user", function (error, hasKey) {
        if (hasKey) {
            index.html.user.value = storage.getSync("neocities_user");
        }
    });
    storage.has("do_timestamp", function (error, hasKey) {
        if (hasKey) {
            index.html.do_timestamp.checked = storage.getSync("do_timestamp");
        }
    });
    storage.has("do_zip", function (error, hasKey) {
        if (hasKey) {
            index.html.do_zip.checked = storage.getSync("do_zip");
        }
    });
}

function calculatePath() {
    if (index.path == undefined || index.html.user.value == "") {
        return;
    }
    let finalPath = index.path;
    let finalPathCosmetic = finalPath;
    if (index.html.do_timestamp.checked) {
        let timeStamp = DateTime.now().toISODate();
        finalPath = path.join(finalPath, index.html.user.value + "-" + timeStamp);
        finalPathCosmetic = finalPath;
    }
    if (index.html.do_zip.checked) {
        finalPathCosmetic = finalPath + ".zip";
    }
    index.html.plan_feedback.innerHTML = "Your files will be saved in: " + finalPathCosmetic;
    index.calculatedPath = finalPath;
}

function setInputs(disabled) {
    let inputs = Array.from(document.getElementsByTagName("input"));
    let textareas = Array.from(document.getElementsByTagName("textarea"));
    // let buttons = Array.from(document.getElementsByTagName("button"));
    // let elements = inputs.concat(textareas).concat(buttons);
    let elements = inputs.concat(textareas);

    for (let i = 0; i < elements.length; i++) {
        elements[i].disabled = disabled;
    }
}
