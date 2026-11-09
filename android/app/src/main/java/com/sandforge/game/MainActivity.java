package com.sandforge.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.content.Context;
import android.view.Choreographer;
import android.view.InputDevice;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

/**
 * SandForge runs as a WebGL game inside a full-screen WebView.
 * The game files live in assets/www and are served from https://appassets.androidplatform.net/
 * so the page is a secure context (needed for WebRTC multiplayer and localStorage).
 */
public class MainActivity extends Activity {
    private static final String START_URL = "https://appassets.androidplatform.net/assets/www/index.html";
    private static final int FILE_REQUEST = 42;

    private GameWebView webView;

    // ---- physical mouse (Bluetooth / USB-OTG): captured relative motion is sent to the game ----
    private float mouseDx = 0, mouseDy = 0, mouseWheel = 0;
    private int mouseButtons = 0, sentButtons = 0;
    private boolean flushPending = false;

    /** WebView that tells the game when Android grants or drops mouse capture. */
    static class GameWebView extends WebView {
        GameWebView(Context c) { super(c); }
        @Override
        public void onPointerCaptureChange(boolean hasCapture) {
            super.onPointerCaptureChange(hasCapture);
            evaluateJavascript("window.sfPointerCapture && window.sfPointerCapture(" + hasCapture + ")", null);
        }
    }

    /** Methods the game (JavaScript) can call. */
    public class Bridge {
        @JavascriptInterface
        public boolean canCapture() { return Build.VERSION.SDK_INT >= 26; }

        @JavascriptInterface
        public void capturePointer() {
            if (Build.VERSION.SDK_INT < 26) return;
            runOnUiThread(() -> { webView.requestFocus(); webView.requestPointerCapture(); });
        }

        @JavascriptInterface
        public void releasePointer() {
            if (Build.VERSION.SDK_INT < 26) return;
            runOnUiThread(() -> webView.releasePointerCapture());
        }
    }

    private final Choreographer.FrameCallback flush = frameTimeNanos -> {
        flushPending = false;
        if (mouseDx == 0 && mouseDy == 0 && mouseWheel == 0 && mouseButtons == sentButtons) return;
        String js = "window.sfMouse && window.sfMouse(" + mouseDx + "," + mouseDy + "," + mouseButtons + "," + mouseWheel + ")";
        mouseDx = 0; mouseDy = 0; mouseWheel = 0; sentButtons = mouseButtons;
        webView.evaluateJavascript(js, null);
    };

    private void scheduleFlush() {
        if (flushPending) return;
        flushPending = true;
        Choreographer.getInstance().postFrameCallback(flush);
    }

    private boolean onCapturedMouse(MotionEvent ev) {
        int action = ev.getActionMasked();
        if (action == MotionEvent.ACTION_SCROLL) {
            mouseWheel += -ev.getAxisValue(MotionEvent.AXIS_VSCROLL);
        } else {
            for (int i = 0; i < ev.getHistorySize(); i++) { mouseDx += ev.getHistoricalX(i); mouseDy += ev.getHistoricalY(i); }
            mouseDx += ev.getX();
            mouseDy += ev.getY();
        }
        int b = ev.getButtonState();
        int mapped = ((b & MotionEvent.BUTTON_PRIMARY) != 0 ? 1 : 0) | ((b & MotionEvent.BUTTON_SECONDARY) != 0 ? 2 : 0);
        if (mapped != mouseButtons) {
            mouseButtons = mapped;
            flush.doFrame(0);       // button changes are sent at once
        } else {
            scheduleFlush();
        }
        return true;
    }
    private ValueCallback<Uri[]> fileCallback;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView = new GameWebView(this);
        webView.setFocusable(true);
        webView.setFocusableInTouchMode(true);
        webView.addJavascriptInterface(new Bridge(), "SandForgeAndroid");
        if (Build.VERSION.SDK_INT >= 26) webView.setOnCapturedPointerListener((v, ev) -> onCapturedMouse(ev));
        webView.setBackgroundColor(0xFF10161C);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                if ("appassets.androidplatform.net".equals(url.getHost())) return false;
                // open external links in the browser
                try { startActivity(new Intent(Intent.ACTION_VIEW, url)); } catch (Exception ignored) { }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            // Lets the addon manager pick a .js file from the phone
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(intent, "Выберите файл аддона"), FILE_REQUEST);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.requestFocus();
        hideSystemUi();
        if (savedInstanceState != null) webView.restoreState(savedInstanceState);
        else webView.loadUrl(START_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_REQUEST && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
        }
    }

    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        webView.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    // Keep keyboard keys (Space, Tab, arrows, Esc) for the game instead of Android navigation
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        int k = event.getKeyCode();
        boolean fromKeyboard = event.getDevice() != null && (event.getDevice().getSources() & InputDevice.SOURCE_KEYBOARD) == InputDevice.SOURCE_KEYBOARD
                && event.getDevice().getKeyboardType() == InputDevice.KEYBOARD_TYPE_ALPHABETIC;
        if (fromKeyboard && k == KeyEvent.KEYCODE_ESCAPE) {
            if (event.getAction() == KeyEvent.ACTION_DOWN) {
                if (Build.VERSION.SDK_INT >= 26 && webView.hasPointerCapture()) {
                    webView.releasePointerCapture();   // the game pauses itself when it loses the mouse
                } else {
                    webView.evaluateJavascript("window.dispatchEvent(new KeyboardEvent('keydown', {code: 'Escape', key: 'Escape', keyCode: 27}))", null);
                }
            }
            return true;
        }
        if (!webView.hasFocus()) webView.requestFocus();
        return super.dispatchKeyEvent(event);
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        // Let the game handle "back" (close menus / pause). If it is on the main menu, exit.
        webView.evaluateJavascript("window.sfBack ? window.sfBack() : false", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        hideSystemUi();
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }
}
