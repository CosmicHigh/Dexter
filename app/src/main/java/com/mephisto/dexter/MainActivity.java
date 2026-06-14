// MainActivity.java
package com.mephisto.dexter;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;

import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends AppCompatActivity {

    private WebView webView;

    /* ── file-chooser for <input type="file"> (import) ── */
    private ValueCallback<Uri[]> fileChooserCallback;
    private final ActivityResultLauncher<Intent> fileChooserLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        if (fileChooserCallback == null) return;
                        Uri[] uris = null;
                        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
                            Uri uri = result.getData().getData();
                            if (uri != null) uris = new Uri[]{uri};
                        }
                        fileChooserCallback.onReceiveValue(uris);
                        fileChooserCallback = null;
                    });

    /* ── SAF save-file launcher (export) ── */
    private String pendingExportJson;
    private final ActivityResultLauncher<Intent> saveFileLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        if (result.getResultCode() == Activity.RESULT_OK
                                && result.getData() != null
                                && result.getData().getData() != null
                                && pendingExportJson != null) {
                            Uri uri = result.getData().getData();
                            try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                                if (os != null) {
                                    os.write(pendingExportJson.getBytes(StandardCharsets.UTF_8));
                                    os.flush();
                                }
                                runOnUiThread(() -> webView.evaluateJavascript(
                                        "if(window._exportCb) window._exportCb(true);", null));
                            } catch (Exception e) {
                                runOnUiThread(() -> webView.evaluateJavascript(
                                        "if(window._exportCb) window._exportCb(false);", null));
                            }
                        } else {
                            // user cancelled
                            runOnUiThread(() -> webView.evaluateJavascript(
                                    "if(window._exportCb) window._exportCb(false);", null));
                        }
                        pendingExportJson = null;
                    });

    /* ── SAF open-file launcher (import via native picker) ── */
    private final ActivityResultLauncher<Intent> openFileLauncher =
            registerForActivityResult(
                    new ActivityResultContracts.StartActivityForResult(),
                    result -> {
                        if (result.getResultCode() == Activity.RESULT_OK
                                && result.getData() != null
                                && result.getData().getData() != null) {
                            Uri uri = result.getData().getData();
                            try (InputStream is = getContentResolver().openInputStream(uri)) {
                                if (is != null) {
                                    byte[] bytes = is.readAllBytes();
                                    String json = new String(bytes, StandardCharsets.UTF_8);
                                    // Escape for JS string
                                    String escaped = json
                                            .replace("\\", "\\\\")
                                            .replace("'", "\\'")
                                            .replace("\n", "\\n")
                                            .replace("\r", "\\r");
                                    runOnUiThread(() -> webView.evaluateJavascript(
                                            "if(window._importCb) window._importCb('" + escaped + "');",
                                            null));
                                }
                            } catch (Exception e) {
                                runOnUiThread(() -> webView.evaluateJavascript(
                                        "if(window._importCb) window._importCb(null);", null));
                            }
                        }
                    });

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        setContentView(webView);

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);   // REQUIRED — Dexter stores data in localStorage
        ws.setDatabaseEnabled(true);
        ws.setAllowFileAccess(true);

        // JavaScript → native bridge
        webView.addJavascriptInterface(new AndroidBridge(), "Android");

        // WebChromeClient for <input type="file"> support
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView webView,
                                             ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileChooserCallback != null) {
                    fileChooserCallback.onReceiveValue(null);
                }
                fileChooserCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    fileChooserLauncher.launch(intent);
                } catch (Exception e) {
                    fileChooserCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("file:///android_asset/Dexter.html");

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });
    }

    /**
     * Bridge exposed to JavaScript as window.Android
     */
    private class AndroidBridge {

        /**
         * Called from JS to export a backup file using the native SAF picker.
         * @param filename suggested file name
         * @param json     the JSON string to save
         */
        @JavascriptInterface
        public void exportFile(String filename, String json) {
            pendingExportJson = json;
            Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            intent.putExtra(Intent.EXTRA_TITLE, filename);
            runOnUiThread(() -> saveFileLauncher.launch(intent));
        }

        /**
         * Called from JS to open a native file picker for importing a backup.
         */
        @JavascriptInterface
        public void importFile() {
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.setType("application/json");
            // Also accept .json files that might have octet-stream type
            String[] mimeTypes = {"application/json", "text/plain", "application/octet-stream"};
            intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeTypes);
            runOnUiThread(() -> openFileLauncher.launch(intent));
        }
    }
}