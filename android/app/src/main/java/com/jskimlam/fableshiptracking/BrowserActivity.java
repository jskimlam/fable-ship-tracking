package com.jskimlam.fableshiptracking;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * 앱 안 브라우저.
 *
 * 쓰임새
 *   - 로그인이 필요한 소스(Wingo 등)에 사용자가 직접 로그인 → 쿠키가 앱에 남아 이후 직접 조회 때 같은 세션을 쓴다
 *   - 사이트가 보안 확인(사람 확인)을 요구할 때 사용자가 직접 통과
 *   - 읽어 온 값의 원문 페이지 확인
 * 이 화면은 사이트를 그대로 보여 줄 뿐, 입력 내용(아이디·비밀번호)을 읽거나 저장하지 않는다.
 */
public class BrowserActivity extends Activity {

    public static final String EXTRA_URL = "url";       // 열 주소
    public static final String EXTRA_TITLE = "title";   // 상단에 보여 줄 제목

    private WebView web;                                 // 사이트를 보여 주는 웹뷰
    private ProgressBar bar;                             // 불러오는 중 표시
    private TextView titleView;                          // 상단 제목

    /** dp 단위를 픽셀로 */
    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = getIntent().getStringExtra(EXTRA_URL);
        String title = getIntent().getStringExtra(EXTRA_TITLE);
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { // 잘못된 주소면 바로 닫는다
            finish();
            return;
        }

        // 화면 뼈대: [상단 바] [진행 막대] [웹뷰]
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#06101C"));
        root.setFitsSystemWindows(true);

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        top.setPadding(dp(12), dp(6), dp(8), dp(6));

        titleView = new TextView(this);
        titleView.setText(title == null || title.isEmpty() ? url : title);
        titleView.setTextColor(Color.parseColor("#E9F2FB"));
        titleView.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        titleView.setSingleLine(true);
        top.addView(titleView, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        Button reload = new Button(this);
        reload.setText("새로고침");
        reload.setAllCaps(false);
        reload.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                web.reload();
            }
        });
        top.addView(reload, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)));

        Button close = new Button(this);
        close.setText("닫기");
        close.setAllCaps(false);
        close.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        top.addView(close, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(42)));
        root.addView(top, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        bar.setMax(100);
        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3)));

        web = new WebView(this);
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        // 일반 브라우저처럼 동작하도록 설정 (네이티브 기능은 연결하지 않는다)
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setBuiltInZoomControls(true);                  // 두 손가락 확대
        s.setDisplayZoomControls(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportMultipleWindows(false);
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true); // 로그인 흐름에 필요한 사이트가 있다

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                return !("https".equals(scheme) || "http".equals(scheme)); // 웹 주소만 따라간다
            }

            @Override
            public void onPageStarted(WebView view, String startedUrl, Bitmap favicon) {
                bar.setVisibility(View.VISIBLE);
            }

            @Override
            public void onPageFinished(WebView view, String finishedUrl) {
                bar.setVisibility(View.INVISIBLE);
                CookieManager.getInstance().flush();     // 로그인 직후 세션이 바로 저장되도록
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                bar.setProgress(newProgress);
            }
        });

        web.loadUrl(url);
    }

    /** 뒤로 가기: 페이지 이력이 있으면 이전 페이지, 없으면 화면 닫기 */
    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        CookieManager.getInstance().flush();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
