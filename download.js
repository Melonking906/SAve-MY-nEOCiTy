const storage = require("electron-json-storage");
const fs = require("fs-extra");
const path = require("path");
const NeoCities = require("neocities-extended");
const Downloader = require("nodejs-file-downloader");
process.on("uncaughtException", function (err) {
    dl.forceStop = true;
    console.log("Unknown Downloader.js Error, forcing a stop");
    console.error(err);
});

let dl = {};

dl.settings = {};
dl.ncProto = "https://";
dl.settings.ncURL = ".neocities.org/";
dl.settings.downloadWaitTime = 300;
dl.settings.typesToRemove = [".html", ".htm"];
dl.settings.filesToRemove = []; //["index.html", "index.htm"];

function resetVars() {
    dl.api = undefined;

    dl.user = "unsetUser";

    dl.downloadPath = path.join("/Users/daniel/Downloads/Test");

    dl.filesFound = [];

    dl.siteSize = 0;
    dl.siteSizeDone = 0;

    dl.stage = -1;

    dl.forceStop = false;

    // First download attempt
    dl.stageOne = {};
    dl.stageOne.downloaded = [];
    dl.stageOne.failed = [];

    // Second download attempt
    dl.stageTwo = {};
    dl.stageTwo.downloaded = [];
    dl.stageTwo.failed = [];

    // Third download attempt
    dl.stageThree = {};
    dl.stageThree.downloaded = [];
    dl.stageThree.failed = [];
}

async function go(downloadData, downloadCallback) {
    resetVars();

    downloadData = JSON.parse(downloadData);
    dl.downloadPath = downloadData.path;

    try {
        dl.api = new NeoCities(downloadData.user, downloadData.pass);
    } catch (error) {
        console.log("Error connecting to NC: " + error);
        dl.stage = -10;
        return;
    }

    dl.user = downloadData.user;

    // Get all files on the site
    dl.api.list("", (resp) => {
        if (resp.result != "success") {
            console.log("There was an error getting site files!");
            dl.stage = -10;
            return;
        }

        if (resp.files.length < 1) {
            console.log("No files were found to download!");
            dl.stage = -10;
            return;
        }

        // Stage one download
        console.log("Starting file sort!");
        for (let i = 0; i < resp.files.length; i++) {
            let file = resp.files[i];
            // Its a directory not a file so make it!
            if (file.is_directory) {
                fs.ensureDir(path.join(dl.downloadPath, file.path));
                continue;
            }
            dl.siteSize += file.size;
            dl.filesFound.push(file);
        }
        dl.stage = 0;
    });
    await waitForFileLoad();

    // There was an error, do not continue
    if (dl.stage == -10 || dl.forceStop) {
        console.log("STOPPING Neocities Download!");
        return returnFail(downloadCallback);
    }

    // Stage one download
    console.log("Starting Stage One Download!");
    dl.stage = 1;
    let oneTime = 0;
    dl.filesFound.forEach((file) => {
        oneTime++;
        downloadFile(file, dl.stageOne, oneTime);
    });
    await waitForStageOneFinish();

    // STOP
    if (dl.forceStop) {
        console.log("STOPPING Neocities Download!");
        return returnFail(downloadCallback);
    }

    // Stage two download
    console.log("Starting Stage Two Download!");
    dl.stage = 2;
    let twoTime = 0;
    dl.stageOne.failed.forEach((file) => {
        twoTime++;
        downloadFile(file, dl.stageTwo, twoTime);
    });
    await waitForStageTwoFinish();

    // STOP
    if (dl.forceStop) {
        console.log("STOPPING Neocities Download!");
        return returnFail(downloadCallback);
    }

    // Stage three download
    console.log("Starting Stage Three Download!");
    dl.stage = 3;
    let threeTime = 0;
    dl.stageTwo.failed.forEach((file) => {
        threeTime++;
        downloadFile(file, dl.stageThree, threeTime);
    });
    await waitForStageThreeFinish();

    // STOP
    if (dl.forceStop) {
        console.log("STOPPING Neocities Download!");
        return returnFail(downloadCallback);
    }

    // Finish!
    let results = {};
    results.result = "success";
    results.counts = {};
    results.counts.found = dl.filesFound.length;
    results.counts.downloaded = dl.stageOne.downloaded.length + dl.stageTwo.downloaded.length + dl.stageThree.downloaded.length;
    results.counts.failed = dl.stageThree.failed.length;
    results.counts.total_size = dl.siteSize;
    results.counts.downloaded_size = dl.siteSizeDone;
    results.files = {};
    results.files.found = dl.filesFound;
    results.files.downloaded = dl.stageOne.downloaded.concat(dl.stageTwo.downloaded).concat(dl.stageThree.downloaded);
    results.files.failed = dl.stageThree.failed;

    dl.stage = 10; // Finish stage

    console.log("DONE! Files Found: " + results.counts.found + " Files Downloaded: " + results.counts.downloaded + " Files Failed: " + results.counts.failed);
    if (results.counts.failed > 0) {
        console.log("Failed Files:");
        results.files.failed.forEach((file) => {
            console.log(file);
        });
    }

    downloadCallback(results);
    return results;
}

function stop() {
    dl.forceStop = true;
}

async function downloadFile(file, stage, delatMult) {
    await sleep(dl.settings.downloadWaitTime * delatMult); //Slow requests so as not to spam the api

    // Inform impending threads to close when they wake up!
    if (dl.forceStop) {
        return;
    }

    // Fix for the stupid removal of .html on neocities
    let fileType = path.extname(file.path);
    let fileName = path.basename(file.path);
    let remoteFilePath = file.path;
    if (dl.settings.filesToRemove.includes(fileName.toLowerCase())) {
        remoteFilePath = remoteFilePath.replace(fileName, "");
    } else if (dl.settings.typesToRemove.includes(fileType.toLowerCase())) {
        remoteFilePath = remoteFilePath.replace(fileType, "");
    }

    // Do a download!
    const downloader = new Downloader({
        url: dl.ncProto + dl.user + dl.settings.ncURL + remoteFilePath, // Remote url and file name
        directory: path.dirname(path.join(dl.downloadPath, file.path)), // Local folder to save to
        cloneFiles: false,
    });

    try {
        const { filePath, downloadStatus } = await downloader.download(); //Downloader.download() resolves with some useful properties.
        stage.downloaded.push(file.path);
        dl.siteSizeDone += file.size;
        console.log("Download success: " + file.path);
    } catch (error) {
        stage.failed.push(file);
        console.log("Download error: " + file.path, error);
    }
}

function getStatus() {
    let status = {};
    status.stage = dl.stage;
    status.goal = dl.filesFound.length;
    status.downloaded = dl.stageOne.downloaded.length + dl.stageTwo.downloaded.length + dl.stageThree.downloaded.length;
    status.percentage = Math.round((100 * status.downloaded) / status.goal);
    status.total_size = dl.siteSize;
    status.downloaded_size = dl.siteSizeDone;

    // Assume 1kb per 10ms
    // let timeSize = dl.siteSize / 100 - dl.siteSizeDone / 100;
    let timeWaiting = dl.settings.downloadWaitTime * (status.goal - status.downloaded);
    status.time = timeWaiting;

    if (status.stage > 0) {
        console.log("Status: " + status.downloaded + " downloaded of " + status.goal + " / " + status.percentage + "% - estimated time is " + status.time / 1000 + " seconds!");
    } else {
        console.log("Status: Not running.");
    }

    return status;
}

function returnFail(downloadCallback) {
    let results = {};
    results.result = "fail";
    downloadCallback(results);
    return results;
}

// +++ Timing +++

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFileLoad() {
    while (!dl.forceStop && dl.stage == -1) {
        await sleep(1000);
    }
    return;
}

async function waitForStageOneFinish() {
    while (!dl.forceStop && (dl.stage != 1 || dl.filesFound.length != dl.stageOne.downloaded.length + dl.stageOne.failed.length)) {
        getStatus();
        await sleep(1000);
    }
    return;
}

async function waitForStageTwoFinish() {
    while (!dl.forceStop && (dl.stage != 2 || dl.stageOne.failed.length != dl.stageTwo.downloaded.length + dl.stageTwo.failed.length)) {
        getStatus();
        await sleep(1000);
    }
    return;
}

async function waitForStageThreeFinish() {
    while (!dl.forceStop && (dl.stage != 3 || dl.stageTwo.failed.length != dl.stageThree.downloaded.length + dl.stageThree.failed.length)) {
        getStatus();
        await sleep(1000);
    }
    return;
}

module.exports = {
    go: function (downloadData, downloadCallback) {
        return go(downloadData, downloadCallback);
    },
    getStatus: function () {
        return getStatus();
    },
    stop: function () {
        return stop();
    },
};
