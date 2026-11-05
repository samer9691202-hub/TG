package com.fayrouz.app;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Native bridge used by the Fayrouz WebView to list and launch installed apps. */
public final class FayrouzAndroidBridge {
    private final Activity activity;

    public FayrouzAndroidBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getInstalledApps() {
        try {
            PackageManager pm = activity.getPackageManager();
            Intent launcherIntent = new Intent(Intent.ACTION_MAIN, null);
            launcherIntent.addCategory(Intent.CATEGORY_LAUNCHER);
            List<ResolveInfo> resolved;
            if (Build.VERSION.SDK_INT >= 33) {
                resolved = pm.queryIntentActivities(launcherIntent,
                        PackageManager.ResolveInfoFlags.of(0L));
            } else {
                //noinspection deprecation
                resolved = pm.queryIntentActivities(launcherIntent, 0);
            }
            Collections.sort(resolved, new Comparator<ResolveInfo>() {
                @Override public int compare(ResolveInfo a, ResolveInfo b) {
                    return String.valueOf(a.loadLabel(pm)).compareToIgnoreCase(String.valueOf(b.loadLabel(pm)));
                }
            });
            JSONArray apps = new JSONArray();
            String ownPackage = activity.getPackageName();
            for (ResolveInfo info : resolved) {
                if (info.activityInfo == null) continue;
                String packageName = info.activityInfo.packageName;
                if (packageName == null || packageName.equals(ownPackage)) continue;
                JSONObject item = new JSONObject();
                item.put("label", String.valueOf(info.loadLabel(pm)));
                item.put("packageName", packageName);
                apps.put(item);
            }
            return apps.toString();
        } catch (Exception e) {
            return "[]";
        }
    }

    @JavascriptInterface
    public boolean launchApp(final String packageName) {
        if (packageName == null || packageName.trim().isEmpty()) return false;
        try {
            final Intent launchIntent = activity.getPackageManager().getLaunchIntentForPackage(packageName);
            if (launchIntent == null) return false;
            launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.runOnUiThread(new Runnable() {
                @Override public void run() {
                    try { activity.startActivity(launchIntent); }
                    catch (Exception ignored) { }
                }
            });
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
