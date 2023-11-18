require("dotenv").config();
const { notarize } = require("electron-notarize");

exports.default = async function notarizing(context) {
    if (true) {
        // Disabled because I don't have a paid apple dev account!
        return;
    }

    const { electronPlatformName, appOutDir } = context;
    if (electronPlatformName !== "darwin") {
        return;
    }

    const appName = context.packager.appInfo.productFilename;

    return await notarize({
        appBundleId: "net.melonking.SaveMyNeocity",
        appPath: `${appOutDir}/${appName}.app`,
        appleId: process.env.APPLE_ID,
        appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    });
};
