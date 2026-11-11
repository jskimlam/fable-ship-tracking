package com.jskimlam.fableshiptracking;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.util.ArrayList;
import java.util.List;

/**
 * 메인 화면.
 *
 * 구조
 *   [scrapeHost]  직접 조회용 숨은 웹뷰들이 붙는 자리 (메인 화면 뒤에 깔려 보이지 않음)
 *   [mainWeb]     앱 화면 (assets/www/index.html) — 지도·브리핑 UI 전부가 여기서 돈다
 *
 * 직접 조회 방식 (API·키 없음)
 *   화면(JS)이 FstNative.scrape(요청id, 주소, 추출스크립트, 제한시간) 을 부르면
 *   ① 숨은 웹뷰로 그 주소를 실제 브라우저처럼 연다
 *   ② 페이지가 뜨면 추출스크립트를 그 페이지 안에서 실행한다 (화면의 글자를 읽어 window.__FST_OUT 에 담는 스크립트)
 *   ③ window.__FST_OUT 이 채워질 때까지 0.5초마다 확인하다가, 채워지면 화면(JS)의 FST_NATIVE_CB 로 돌려준다
 *   사용자가 갱신을 눌렀을 때만 동작하며, 백그라운드 통신·주기 수신은 없다.
 *
 * 보안
 *   - 네이티브 기능(FstNative)은 앱 화면(mainWeb)에만 연결한다. 외부 사이트를 여는 숨은 웹뷰에는 연결하지 않는다.
 *   - mainWeb 은 앱에 내장된 파일(file:///android_asset/) 만 연다. 그 밖의 주소는 앱 안 브라우저(BrowserActivity)로 넘긴다.
 */
public class MainActivity extends Activity {

    /** 앱 화면의 시작 주소 (APK 에 내장된 파일) */
    private static final String APP_URL = "file:///android_asset/www/index.html";
    /** 추출 결과 확인 간격(ms) */
    private static final long POLL_MS = 500L;
    /** 동시에 열 수 있는 숨은 웹뷰 수 (사이트 부담과 메모리 사용을 줄이기 위한 상한) */
    private static final int MAX_JOBS = 3;

    private final Handler ui = new Handler(Looper.getMainLooper()); // UI 스레드 작업 예약용
    private final List<ScrapeJob> jobs = new ArrayList<>();          // 진행 중인 직접 조회 목록
    private FrameLayout scrapeHost;                                   // 숨은 웹뷰를 붙이는 자리
    private WebView mainWeb;                                          // 앱 화면

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 화면 뼈대: 뒤에 scrapeHost, 앞에 mainWeb
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#06101C"));
        root.setFitsSystemWindows(true);                             // 상태 표시줄·내비게이션 바 영역을 피해서 배치
        scrapeHost = new FrameLayout(this);
        root.addView(scrapeHost, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        mainWeb = new WebView(this);
        mainWeb.setBackgroundColor(Color.parseColor("#06101C"));
        root.addView(mainWeb, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        // 쿠키 허용: 사용자가 앱 안 브라우저에서 로그인한 세션을 직접 조회 때 그대로 쓴다
        CookieManager.getInstance().setAcceptCookie(true);

        // 앱 화면 설정
        WebSettings s = mainWeb.getSettings();
        s.setJavaScriptEnabled(true);                                // 화면 로직이 JS
        s.setDomStorageEnabled(true);                                // 선박 목록 저장(localStorage)
        s.setAllowFileAccess(true);                                  // 내장 파일 읽기
        s.setAllowFileAccessFromFileURLs(false);                     // 내장 파일끼리의 임의 읽기는 막음
        s.setAllowUniversalAccessFromFileURLs(false);                // 내장 파일에서 외부 사이트 임의 읽기도 막음
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);                                          // 시스템 글자 크기와 무관하게 설계한 크기로 표시
        mainWeb.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        mainWeb.addJavascriptInterface(new NativeBridge(), "FstNative"); // 화면(JS) ↔ 네이티브 연결
        mainWeb.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith("file:///android_asset/")) return false; // 내장 파일은 그대로 연다
                openBrowser(url, "");                                 // 그 밖의 주소는 앱 안 브라우저로
                return true;
            }
        });

        if (savedInstanceState != null) mainWeb.restoreState(savedInstanceState); // 시스템이 화면을 되살린 경우
        else mainWeb.loadUrl(APP_URL);
    }

    /** 화면(JS)에서 부를 수 있는 네이티브 기능 모음 */
    private final class NativeBridge {

        /** 주소를 직접 열어 값을 읽는다. 결과는 FST_NATIVE_CB(요청id, JSON) 으로 돌려준다. */
        @JavascriptInterface
        public void scrape(final String id, final String url, final String script, final int timeoutMs) {
            ui.post(new Runnable() {                                 // 웹뷰는 UI 스레드에서만 다룰 수 있다
                @Override
                public void run() {
                    startScrape(id, url, script, timeoutMs);
                }
            });
        }

        /** 앱 안 브라우저로 주소 열기 (로그인·보안 확인·원문 보기) */
        @JavascriptInterface
        public void openBrowser(final String url, final String title) {
            ui.post(new Runnable() {
                @Override
                public void run() {
                    MainActivity.this.openBrowser(url, title);
                }
            });
        }
    }

    /** 앱 안 브라우저 화면을 띄운다 */
    private void openBrowser(String url, String title) {
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            Toast.makeText(this, "열 수 없는 주소입니다.", Toast.LENGTH_SHORT).show();
            return;
        }
        Intent it = new Intent(this, BrowserActivity.class);
        it.putExtra(BrowserActivity.EXTRA_URL, url);
        it.putExtra(BrowserActivity.EXTRA_TITLE, title == null ? "" : title);
        startActivity(it);
    }

    /* ======================= 직접 조회 ======================= */

    /** 직접 조회 한 건의 상태 */
    private final class ScrapeJob {
        final String id;                 // 화면(JS)이 준 요청 id
        final String script;             // 페이지 안에서 실행할 추출 스크립트
        final long deadline;             // 이 시각(ms)을 넘기면 시간 초과
        WebView web;                     // 이 조회에 쓰는 숨은 웹뷰
        boolean done;                    // 결과를 이미 돌려줬는지

        ScrapeJob(String id, String script, long deadline) {
            this.id = id;
            this.script = script;
            this.deadline = deadline;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void startScrape(String id, String url, String script, int timeoutMs) {
        // 입력 검증: http/https 주소만 허용
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            deliver(id, false, null, "load", "");
            return;
        }
        if (jobs.size() >= MAX_JOBS) {                               // 너무 많은 조회가 겹치면 거절 (화면은 한 건씩 차례로 요청함)
            deliver(id, false, null, "load", "");
            return;
        }
        int limit = Math.max(5000, Math.min(timeoutMs, 60000));      // 제한시간은 5~60초 사이로 고정
        final ScrapeJob job = new ScrapeJob(id, script == null ? "" : script, System.currentTimeMillis() + limit);

        WebView w = new WebView(this);
        job.web = w;
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);                                // 요즘 사이트는 JS 로 화면을 그린다
        s.setDomStorageEnabled(true);
        s.setBlockNetworkImage(true);                                // 그림은 받지 않는다 (속도·데이터 절약)
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);                          // 새 창 띄우기 금지
        s.setGeolocationEnabled(false);                              // 위치 정보 제공 안 함
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, true); // 로그인 세션 유지에 필요한 사이트가 있다
        // 주의: 이 웹뷰에는 addJavascriptInterface 를 하지 않는다 (외부 사이트가 네이티브 기능을 못 부르게)

        w.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String finishedUrl) {
                if (job.done) return;
                // 페이지가 뜰 때마다 추출 스크립트를 넣는다. (보안 확인 → 본 페이지로 넘어가는 경우 대비)
                // 스크립트는 페이지당 한 번만 돌도록 스스로 막는다 (window.__FST_RUN)
                view.evaluateJavascript(job.script, null);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) finishJob(job, false, null, "load", ""); // 본 페이지 접속 실패
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme)); // 앱 실행 링크(intent:, market: 등)는 따라가지 않는다
            }
        });

        scrapeHost.addView(w, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        jobs.add(job);
        w.loadUrl(url);
        ui.postDelayed(new Runnable() {                              // 결과 확인 시작
            @Override
            public void run() {
                poll(job);
            }
        }, POLL_MS);
    }

    /** 추출 스크립트가 결과를 남겼는지 확인한다 */
    private void poll(final ScrapeJob job) {
        if (job.done || job.web == null) return;
        if (System.currentTimeMillis() > job.deadline) {             // 시간 초과: 지금 떠 있는 페이지 제목만 읽어 함께 알려 준다
            job.web.evaluateJavascript("document.title", new android.webkit.ValueCallback<String>() {
                @Override
                public void onReceiveValue(String v) {
                    finishJob(job, false, null, "timeout", decodeJsString(v));
                }
            });
            return;
        }
        job.web.evaluateJavascript("(function(){return typeof window.__FST_OUT==='string'?window.__FST_OUT:null;})()",
                new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (job.done) return;
                        String out = decodeJsString(v);              // 아직 없으면 null
                        if (out != null && !out.isEmpty()) {
                            finishJob(job, true, out, "", "");
                        } else {
                            ui.postDelayed(new Runnable() {
                                @Override
                                public void run() {
                                    poll(job);
                                }
                            }, POLL_MS);
                        }
                    }
                });
    }

    /** evaluateJavascript 가 돌려준 값(JSON 으로 감싼 문자열)을 원래 문자열로 푼다. null·실패면 null. */
    private static String decodeJsString(String v) {
        if (v == null || "null".equals(v)) return null;
        try {
            Object o = new JSONTokener(v).nextValue();
            return o instanceof String ? (String) o : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** 조회를 끝내고 숨은 웹뷰를 정리한 뒤 결과를 화면에 돌려준다 */
    private void finishJob(ScrapeJob job, boolean ok, String data, String error, String title) {
        if (job.done) return;
        job.done = true;
        jobs.remove(job);
        if (job.web != null) {
            try {
                job.web.stopLoading();
                scrapeHost.removeView(job.web);
                job.web.destroy();
            } catch (Exception ignored) {
                // 정리 중 오류가 나도 결과 전달은 계속한다
            }
            job.web = null;
        }
        deliver(job.id, ok, data, error, title);
    }

    /** 화면(JS)의 FST_NATIVE_CB(요청id, JSON문자열) 호출 */
    private void deliver(String id, boolean ok, String data, String error, String title) {
        if (mainWeb == null) return;
        try {
            JSONObject res = new JSONObject();
            res.put("ok", ok);
            if (ok) res.put("data", data);
            else {
                res.put("error", error);
                res.put("title", title == null ? "" : title);
            }
            String js = "window.FST_NATIVE_CB&&window.FST_NATIVE_CB(" + JSONObject.quote(id) + "," + JSONObject.quote(res.toString()) + ");";
            mainWeb.evaluateJavascript(js, null);
        } catch (Exception e) {
            // JSON 조립 실패 시에도 화면이 기다리지 않도록 실패를 알린다
            mainWeb.evaluateJavascript("window.FST_NATIVE_CB&&window.FST_NATIVE_CB(" + JSONObject.quote(id)
                    + ",'{\"ok\":false,\"error\":\"badjson\"}');", null);
        }
    }

    /* ======================= 화면 수명 주기 ======================= */

    /** 뒤로 가기: 화면(JS)이 먼저 처리(대화상자 닫기 등)하고, 처리할 게 없으면 앱을 뒤로 보낸다 */
    @Override
    public void onBackPressed() {
        mainWeb.evaluateJavascript("(function(){return !!(window.FST_BACK&&window.FST_BACK());})()",
                new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String v) {
                        if (!"true".equals(v)) moveTaskToBack(true);  // 종료하지 않고 뒤로만 보낸다 (대화 기록 유지)
                    }
                });
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        mainWeb.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();                         // 로그인 세션 쿠키를 저장소에 기록
    }

    @Override
    protected void onDestroy() {
        for (ScrapeJob j : new ArrayList<>(jobs)) {                  // 남은 숨은 웹뷰 정리
            j.done = true;
            if (j.web != null) j.web.destroy();
        }
        jobs.clear();
        ui.removeCallbacksAndMessages(null);
        if (mainWeb != null) {
            mainWeb.removeJavascriptInterface("FstNative");
            mainWeb.destroy();
            mainWeb = null;
        }
        super.onDestroy();
    }
}
