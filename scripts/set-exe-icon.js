// electron-builder afterPack hook: write build/icon.ico into Faelights.exe.
// win.signAndEditExecutable is off (its winCodeSign download needs symlink rights on Windows),
// so without this the exe and its Start menu/desktop shortcuts keep Electron's default icon.
const path = require("path");
const rcedit = require("rcedit");

exports.default = async function (context) {
  if (context.electronPlatformName !== "win32") return;
  const { productFilename } = context.packager.appInfo;
  await rcedit(path.join(context.appOutDir, `${productFilename}.exe`), {
    icon: path.join(context.packager.info.projectDir, "build", "icon.ico"),
  });
};
