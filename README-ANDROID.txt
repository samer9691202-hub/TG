Fayrouz 1.1.29 — Android Studio project with native WebView bridge

This is a complete Android Studio source project, not a plain HTML-only ZIP.
The bridge is already connected in MainActivity:
  webView.addJavascriptInterface(new FayrouzAndroidBridge(this), "FayrouzAndroid");

The app's JavaScript calls window.FayrouzAndroid.getInstalledApps() and
window.FayrouzAndroid.launchApp(packageName). The AndroidManifest includes
package visibility queries for launcher apps.

Build:
1. Open this folder (the folder containing settings.gradle) in Android Studio.
2. Allow Gradle sync and install the Android SDK Platform 35 if requested.
3. Choose Build > Build Bundle(s) / APK(s) > Build APK(s).
4. Install the generated APK on your Android phone.
5. Open Fayrouz > وردي > افتحي المصحف. The list should show installed apps
   that have a launcher icon; selecting one opens it.

The project includes the current Fayrouz HTML/CSS/JS files under
app/src/main/assets/www. The native Java bridge is already registered.

Security note: JavaScript is enabled because the local app requires it.
The bridge only exposes listing launcher apps and launching the selected package.
