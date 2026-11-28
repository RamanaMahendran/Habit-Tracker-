package app.habitgrove.android;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.health.connect.HealthConnectManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.ext.SdkExtensions;
import android.provider.Settings;
import android.util.Base64;
import android.view.WindowInsets;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class MainActivity extends Activity {
    static final String OPEN_CHECK_INS = "app.habitgrove.android.OPEN_CHECK_INS";
    private static final String HOST = "habit-grove-planner.ramanan-portfolio93.chatgpt.site";
    private static final Uri ORIGIN = Uri.parse("https://" + HOST);
    private static final int HEALTH_PERMISSION = 101;
    private static final int ALERT_PERMISSION = 102;
    private static final int SAVE_FILE = 103;
    private static final int MAX_FILE_BYTES = 24 * 1024 * 1024;
    private final ExecutorService healthReader = Executors.newSingleThreadExecutor();
    private final ExecutorService files = Executors.newSingleThreadExecutor();
    private WebView page;
    private WebMessagePort port;
    private Request permissionRequest;
    private Request saveRequest;
    private byte[] pendingFile;

    private static final String BRIDGE = """
        (() => {
          if (window.habitGroveAndroid) return;
          const receive = (event) => {
            if (event.data !== 'habit-grove-android' || event.ports.length !== 1) return;
            window.removeEventListener('message', receive);
            const port = event.ports[0];
            const pending = new Map();
            let nextId = 0;
            port.onmessage = ({data}) => {
              const message = JSON.parse(data);
              const complete = pending.get(message.id);
              if (!complete) return;
              pending.delete(message.id);
              clearTimeout(complete.timer);
              if (message.error) complete.reject(new Error(message.error));
              else complete.resolve(message.value);
            };
            port.start();
            window.habitGroveAndroid = {
              request: (action, args = {}) => new Promise((resolve, reject) => {
                const id = ++nextId;
                const timer = setTimeout(() => {
                  pending.delete(id);
                  reject(new Error('The Android request timed out. Please try again.'));
                }, 120000);
                pending.set(id, {resolve, reject, timer});
                port.postMessage(JSON.stringify({id, action, args}));
              }),
            };
            window.dispatchEvent(new Event('habit-grove-android-ready'));
          };
          window.addEventListener('message', receive);
        })();
        """;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        ReminderReceiver.createChannel(this);
        page = new WebView(this);
        page.setBackgroundColor(0xfff5f7f2);
        page.setOnApplyWindowInsetsListener((view, insets) -> {
            Insets safe = insets.getInsets(WindowInsets.Type.systemBars()
                | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
            view.setPadding(safe.left, safe.top, safe.right, safe.bottom);
            return WindowInsets.CONSUMED;
        });
        page.getSettings().setJavaScriptEnabled(true);
        page.getSettings().setDomStorageEnabled(true);
        page.getSettings().setAllowFileAccess(false);
        page.getSettings().setAllowContentAccess(false);
        page.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        page.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!request.isForMainFrame()) return !isApp(uri);
                if (isApp(uri)) return false;
                if ("https".equals(uri.getScheme())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
                    } catch (android.content.ActivityNotFoundException ignored) {
                        // Leave the journal open if there is no external browser.
                    }
                }
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                closeBridge();
            }
            @Override public void onPageFinished(WebView view, String url) {
                if (port != null || !isApp(Uri.parse(url))) return;
                view.evaluateJavascript(BRIDGE, ignored -> installBridge(view));
            }
        });
        setContentView(page);
        page.loadUrl(ORIGIN + (shouldOpenCheckIns(getIntent()) ? "/?view=chat" : "/"));
    }

    private boolean isApp(Uri uri) {
        return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && (uri.getPort() == -1 || uri.getPort() == 443) && uri.getUserInfo() == null;
    }

    private void installBridge(WebView view) {
        if (isFinishing() || view.getUrl() == null || !isApp(Uri.parse(view.getUrl())) || port != null) return;
        WebMessagePort[] channels = view.createWebMessageChannel();
        port = channels[0];
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override public void onMessage(WebMessagePort sender, WebMessage message) {
                if (sender == port && page.getUrl() != null && isApp(Uri.parse(page.getUrl())))
                    handle(sender, message.getData());
            }
        });
        view.postWebMessage(new WebMessage("habit-grove-android", new WebMessagePort[]{channels[1]}), ORIGIN);
    }

    private void closeBridge() {
        if (port != null) port.close();
        port = null;
    }

    private void handle(WebMessagePort sender, String raw) {
        if (raw == null || raw.length() > MAX_FILE_BYTES * 2) return;
        Request request = null;
        try {
            JSONObject json = new JSONObject(raw);
            request = new Request(sender, json.getInt("id"), json.getJSONObject("args"));
            switch (json.getString("action")) {
                case "walking" -> walking(request);
                case "syncReminders" -> {
                    ReminderReceiver.saveDeadlines(this, request.args.getJSONArray("deadlines"));
                    request.reply(null, null);
                }
                case "alertStatus" -> request.reply(alertStatus(), null);
                case "enableAlerts" -> enableAlerts(request);
                case "disableAlerts" -> {
                    ReminderReceiver.setEnabled(this, false);
                    request.reply(alertStatus(), null);
                }
                case "testAlert" -> {
                    if (!ReminderReceiver.enabled(this)) {
                        request.reply(null, "Enable Android alerts before testing.");
                    } else {
                        ReminderReceiver.test(this);
                        request.reply(alertStatus(), null);
                    }
                }
                case "exactAlarms" -> {
                    startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName())));
                    request.reply(alertStatus(), null);
                }
                case "alertSettings" -> {
                    startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                        .putExtra(Settings.EXTRA_CHANNEL_ID, ReminderReceiver.CHANNEL));
                    request.reply(alertStatus(), null);
                }
                case "saveFile" -> saveFile(request);
                default -> request.reply(null, "Unknown Android request.");
            }
        } catch (Exception error) {
            if (request != null) request.reply(null, "The Android request failed. Please try again.");
        }
    }

    private void walking(Request request) throws JSONException {
        if (getSystemService(HealthConnectManager.class) == null) {
            request.reply(null, "Health Connect is unavailable on this device.");
            return;
        }
        if (!WalkingHealth.hasAccess(this)) {
            if (request.args.optBoolean("ask")) {
                ArrayList<String> required = new ArrayList<>(Arrays.asList(WalkingHealth.BASIC));
                if (Build.VERSION.SDK_INT >= 35 || SdkExtensions.getExtensionVersion(34) >= 13)
                    required.add(WalkingHealth.HISTORY);
                ask(request, required.toArray(new String[0]), HEALTH_PERMISSION);
            } else {
                request.reply(new JSONObject().put("access", "permission").put("days", new JSONArray()), null);
            }
            return;
        }
        String start = request.args.getString("start");
        String end = request.args.getString("end");
        healthReader.submit(() -> {
            try {
                request.reply(WalkingHealth.read(this, start, end), null);
            } catch (Exception error) {
                request.reply(null, "Could not read walking workouts. Check Habit Grove’s read permissions in Health Connect.");
            }
        });
    }

    private void enableAlerts(Request request) throws JSONException {
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ask(request, new String[]{Manifest.permission.POST_NOTIFICATIONS}, ALERT_PERMISSION);
            return;
        }
        ReminderReceiver.setEnabled(this, true);
        request.reply(alertStatus(), null);
    }

    private void ask(Request request, String[] permissions, int code) {
        if (permissionRequest != null) {
            request.reply(null, "Finish the current Android permission request first.");
            return;
        }
        permissionRequest = request;
        try {
            requestPermissions(permissions, code);
        } catch (RuntimeException error) {
            permissionRequest = null;
            throw error;
        }
    }

    private JSONObject alertStatus() throws JSONException {
        return new JSONObject().put("enabled", ReminderReceiver.enabled(this))
            .put("exact", ReminderReceiver.exact(this));
    }

    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        Request request = permissionRequest;
        permissionRequest = null;
        if (request == null) return;
        try {
            if (code == HEALTH_PERMISSION && WalkingHealth.hasAccess(this)) {
                walking(request);
            } else if (code == ALERT_PERMISSION) {
                ReminderReceiver.setEnabled(this,
                    checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED);
                request.reply(alertStatus(), null);
            } else {
                request.reply(new JSONObject().put("access", "permission").put("days", new JSONArray()), null);
            }
        } catch (JSONException error) {
            request.reply(null, "Could not confirm the Android permissions.");
        }
    }

    private void saveFile(Request request) throws JSONException {
        if (saveRequest != null) {
            request.reply(null, "Finish saving the current file first.");
            return;
        }
        byte[] bytes = Base64.decode(request.args.getString("base64"), Base64.DEFAULT);
        if (bytes.length > MAX_FILE_BYTES) {
            request.reply(null, "This export is too large to save in the Android app.");
            return;
        }
        Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType(request.args.getString("type"))
            .putExtra(Intent.EXTRA_TITLE, request.args.getString("name"));
        try {
            startActivityForResult(create, SAVE_FILE);
            saveRequest = request;
            pendingFile = bytes;
        } catch (android.content.ActivityNotFoundException error) {
            request.reply(null, "Android’s file picker is unavailable.");
        }
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code != SAVE_FILE || saveRequest == null) return;
        Request request = saveRequest;
        byte[] bytes = pendingFile;
        saveRequest = null;
        pendingFile = null;
        if (result != RESULT_OK || data == null || data.getData() == null) {
            request.reply(null, null);
            return;
        }
        Uri file = data.getData();
        files.submit(() -> {
            try (OutputStream output = getContentResolver().openOutputStream(file)) {
                if (output == null) throw new java.io.IOException();
                output.write(bytes);
                request.reply(null, null);
            } catch (java.io.IOException | SecurityException error) {
                request.reply(null, "Android could not save the export.");
            }
        });
    }

    private boolean shouldOpenCheckIns(Intent intent) {
        return intent != null && OPEN_CHECK_INS.equals(intent.getAction());
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (shouldOpenCheckIns(intent)) page.loadUrl(ORIGIN + "/?view=chat");
    }

    @Override protected void onResume() {
        super.onResume();
        if (page != null) {
            page.onResume();
            page.evaluateJavascript("window.dispatchEvent(new Event('habit-grove-android-resumed'))", null);
        }
        ReminderReceiver.reschedule(this);
    }

    @Override protected void onPause() {
        if (page != null) page.onPause();
        super.onPause();
    }

    @Override protected void onDestroy() {
        closeBridge();
        healthReader.shutdownNow();
        files.shutdown();
        page.destroy();
        super.onDestroy();
    }

    private final class Request {
        final WebMessagePort sender;
        final int id;
        final JSONObject args;
        Request(WebMessagePort sender, int id, JSONObject args) {
            this.sender = sender;
            this.id = id;
            this.args = args;
        }
        void reply(Object value, String error) {
            runOnUiThread(() -> {
                if (sender != port) return;
                try {
                    JSONObject response = new JSONObject().put("id", id)
                        .put("value", value == null ? JSONObject.NULL : value);
                    if (error != null) response.put("error", error);
                    sender.postMessage(new WebMessage(response.toString()));
                } catch (JSONException | IllegalStateException ignored) {
                    // The page may have navigated before the operation finished.
                }
            });
        }
    }
}
