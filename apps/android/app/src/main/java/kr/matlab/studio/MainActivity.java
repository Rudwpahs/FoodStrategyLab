package kr.matlab.studio;

import android.Manifest;
import android.app.ActionBar;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.res.ColorStateList;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Insets;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.graphics.drawable.StateListDrawable;
import android.graphics.text.LineBreakConfig;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Locale;

/**
 * 맛 연구소 스튜디오 앱.
 * 영상·음성 제작은 스튜디오 서버(어머니 PC 또는 클라우드)에서 하고, 이 앱은 그 화면을 휴대폰에서 연다.
 * - 처음 실행하면 스튜디오 주소를 입력한다 (나중에 메뉴에서 바꿀 수 있음)
 * - 사진 찍기(안드로이드 10 이상)·사진·클립 올리기(여러 개 한 번에), ZIP·이미지 내려받기 지원
 * - 인스타그램·네이버 같은 다른 사이트 링크는 휴대폰 브라우저로 연다
 * - 서버가 잠들어 있다 깨어나는 동안에는 '여는 중' 안내를, 연결이 안 되면 '다시 연결하기' 화면을 보여 준다
 * - 색은 웹 스튜디오(apps/studio/web/src/styles.css)와 같다: 청자 타일 바탕, 백자 면, 간장 글자, 고추장 버튼
 */
public class MainActivity extends Activity {
    private static final String PREFS = "matlab";
    private static final String KEY_URL = "studio_url";
    /** 클라우드 스튜디오 주소 (Modal). 설치하면 바로 이 주소가 열린다. 메뉴의 '스튜디오 주소 바꾸기'로 바꿀 수 있다. */
    private static final String DEFAULT_URL = "https://rudwpahs--matlab-studio-web.us-east.modal.run";
    private static final int REQ_FILE = 1;
    private static final int REQ_STORAGE = 2;
    private static final int MENU_RELOAD = 1;
    private static final int MENU_CHANGE_URL = 2;
    /** 여는 데 이보다 오래 걸리면 서버가 깨어나는 중이라는 안내를 더한다 (잠든 클라우드 서버는 30초쯤 걸린다) */
    private static final long SLOW_HINT_MS = 6000;
    /** 이만큼 지나도 열리지 않으면 '여는 중' 대신 '다시 연결하기' 화면을 보인다 */
    private static final long GIVE_UP_MS = 90_000;

    // 웹 스튜디오와 같은 색
    private static final int TILE = 0xFFE7EDE8;        // 청자 타일: 바탕
    private static final int PAPER = 0xFFFDFDFB;       // 백자: 카드 면
    private static final int INK = 0xFF241C17;         // 간장: 글자
    private static final int MUTED = 0xFF5D534C;       // 흐린 글자
    private static final int LINE = 0xFFCDD7CF;        // 카드 테두리
    private static final int LINE_STRONG = 0xFF9FB0A4; // 입력칸·보조 버튼 테두리
    private static final int PRIMARY = 0xFFC8391F;     // 고추장: 주요 버튼
    private static final int ERROR = 0xFFA52C15;       // 오류 글자
    private static final int FOCUS = 0xFF34558F;       // 입력칸을 눌렀을 때 테두리

    private static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT;
    private static final int WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;

    private final Handler handler = new Handler(Looper.getMainLooper());

    /** 상태 표시줄·내비게이션 막대·키보드에 가리지 않게 안쪽 여백을 두는 바깥 틀. 화면을 바꿔도 이 틀은 그대로 둔다. */
    private FrameLayout appRoot;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    /** '사진 찍기'로 찍은 사진이 저장될 칸 (사진첩). 찍지 않으면 지운다. */
    private Uri cameraUri;
    /**
     * 저장 권한을 묻는 동안 기다리는 내려받기들 (안드로이드 9 이하): 하나에 주소·User-Agent·형식·파일 이름 4칸씩.
     * 묻는 사이 화면이 다시 만들어지면 (야간 모드·글자 크기·언어 변경, 화면 분할, 앱이 정리됨) 답은 새 화면으로 오므로 저장해 두었다 되살린다.
     */
    private static final String STATE_PENDING_DOWNLOADS = "pendingDownloads";
    private final ArrayList<String> pendingDownloads = new ArrayList<>();
    private String studioBase;
    private String retryUrl;

    // 스튜디오 화면 위에 겹치는 '여는 중'·'연결 안 됨' 안내
    private View loadingPanel;
    private TextView slowHint;
    private boolean loading;
    /** 여는 중에 새로고침하면 앞선 요청이 '중단'으로 끝나며 끝 알림이 온다. 그 알림으로 덮개를 걷지 않게 한 번 건너뛴다. */
    private boolean skipAbortedFinish;
    private View errorPanel;
    private TextView errorDetail;

    private final Runnable revealSlowHint = () -> {
        if (loading && slowHint != null) slowHint.setVisibility(View.VISIBLE);
    };

    /** 너무 오래 열리지 않으면 멈추고 '다시 연결하기'를 보인다 (끝 알림이 영영 오지 않는 경우도 있다) */
    private final Runnable giveUp = () -> {
        if (!loading || web == null) return;
        web.stopLoading();
        String current = web.getUrl();
        showError("90초 넘게 응답이 없어요.", isOurs(current) ? current : studioBase);
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        ArrayList<String> waiting = savedInstanceState == null ? null
                : savedInstanceState.getStringArrayList(STATE_PENDING_DOWNLOADS);
        if (waiting != null && waiting.size() % 4 == 0) pendingDownloads.addAll(waiting);
        styleWindow();
        appRoot = new FrameLayout(this);
        appRoot.setBackgroundColor(TILE);
        fitSystemBars(appRoot);
        setContentView(appRoot);
        String url = cleanUrl(prefs().getString(KEY_URL, ""));
        if (url.isEmpty()) showStudio(DEFAULT_URL);
        else if (isLoadableUrl(url)) showStudio(url);
        // 저장된 주소를 웹 화면이 열 수 없으면 (예전 판에서 저장된 오타 주소) 주소를 고치는 화면으로
        else showSetup();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (!pendingDownloads.isEmpty()) {
            outState.putStringArrayList(STATE_PENDING_DOWNLOADS, new ArrayList<>(pendingDownloads));
        }
    }

    @Override
    protected void onDestroy() {
        closeStudio();
        super.onDestroy();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    // ── 화면 1: 스튜디오 주소 입력 ──

    /** 스튜디오 주소 입력 화면 */
    private void showSetup() {
        closeStudio();
        LinearLayout card = card();

        card.addView(text("이희재의 맛 연구소 스튜디오", 22, INK, true), below(0));

        TextView help = text("스튜디오 주소를 입력하세요.\n보통은 이미 채워진 클라우드 주소 그대로 '연결하기'를 누르면 돼요.", 15, INK, false);
        help.setLineSpacing(0, 1.4f);
        card.addView(help, below(12));

        TextView about = text("영상과 목소리는 클라우드 서버에서 만들어지고, 이 앱은 그 화면을 휴대폰에서 보여 줘요.", 15, MUTED, false);
        about.setLineSpacing(0, 1.4f);
        card.addView(about, below(8));

        final EditText input = new EditText(this);
        input.setId(View.generateViewId());
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        input.setHint("https://");
        input.setText(prefs().getString(KEY_URL, DEFAULT_URL));
        input.setSelection(input.getText().length());
        input.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        input.setTextColor(INK);
        input.setHintTextColor(MUTED);
        input.setBackground(fieldBackground());
        input.setPadding(dp(14), dp(12), dp(14), dp(12));
        input.setMinHeight(dp(52));

        TextView label = text("스튜디오 주소", 14, INK, true);
        label.setLabelFor(input.getId());
        card.addView(label, below(24));
        card.addView(input, below(8));

        final TextView invalid = text("열 수 없는 주소예요. 띄어쓰기나 오타가 없는지 확인해 주세요.", 14, ERROR, false);
        invalid.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        String saved = cleanUrl(prefs().getString(KEY_URL, ""));
        invalid.setVisibility(!saved.isEmpty() && !isLoadableUrl(saved) ? View.VISIBLE : View.GONE);
        card.addView(invalid, below(8));

        Button connect = button("연결하기", true);
        card.addView(connect, below(20));

        final Runnable submit = () -> {
            String u = cleanUrl(input.getText().toString());
            String lower = u.toLowerCase(Locale.ROOT);
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) u = "https://" + u;
            if (u.endsWith("/")) u = u.substring(0, u.length() - 1);
            if (!isLoadableUrl(u)) {
                invalid.setVisibility(View.VISIBLE);
                input.requestFocus();
                return;
            }
            hideKeyboard(input);
            prefs().edit().putString(KEY_URL, u).apply();
            showStudio(u);
        };
        connect.setOnClickListener(v -> submit.run());
        input.setOnEditorActionListener((v, actionId, event) -> {
            boolean enter = event != null && event.getKeyCode() == KeyEvent.KEYCODE_ENTER
                    && event.getAction() == KeyEvent.ACTION_DOWN;
            if (actionId != EditorInfo.IME_ACTION_GO && !enter) return false;
            submit.run();
            return true;
        });

        setScreen(centered(card));
    }

    // ── 화면 2: 스튜디오 (웹 화면) ──

    /** 스튜디오 화면 */
    private void showStudio(final String base) {
        closeStudio();
        studioBase = base;
        retryUrl = base;

        final WebView view = new WebView(this);
        web = view;
        // 페이지가 그려지기 전에도 흰 화면이 번쩍이지 않게 바탕색을 맞춘다
        view.setBackgroundColor(TILE);
        WebSettings s = view.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);

        final Uri baseUri = Uri.parse(base);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                Uri u = request.getUrl();
                // 스튜디오 밖 링크(인스타그램·네이버 등)는 휴대폰 브라우저로
                if (u.getHost() != null && !u.getHost().equals(baseUri.getHost())) {
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (ActivityNotFoundException e) {
                        Toast.makeText(MainActivity.this, "이 링크를 열 앱이 없어요.", Toast.LENGTH_LONG).show();
                    }
                    return true;
                }
                return false;
            }

            @Override
            public void onPageStarted(WebView v, String url, Bitmap favicon) {
                if (v != web) return;
                skipAbortedFinish = false;
                hideError();
                showLoading();
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                if (v != web) return;
                if (skipAbortedFinish) {
                    skipAbortedFinish = false;
                    return;
                }
                hideLoading();
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest request, WebResourceError error) {
                if (v != web || !request.isForMainFrame()) return;
                Uri failed = request.getUrl();
                // 스튜디오 주소에서 실패했으면 그 주소를, 아니면 스튜디오 첫 화면을 다시 연다
                boolean ours = failed != null && failed.getHost() != null && failed.getHost().equals(baseUri.getHost());
                showError(String.valueOf(error.getDescription()), ours ? failed.toString() : base);
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView v, int newProgress) {
                // 끝 알림(onPageFinished)이 빠지는 경우에도 덮개가 남아 화면을 막지 않게
                if (v == web && newProgress >= 100 && !skipAbortedFinish) hideLoading();
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                discardPhoto(cameraUri);
                cameraUri = null;
                try {
                    startActivityForResult(fileChooser(params), REQ_FILE);
                } catch (Exception e) {
                    discardPhoto(cameraUri);
                    cameraUri = null;
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "파일을 고를 수 없어요.", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });
        // ZIP·이미지 내려받기: 로그인 쿠키를 함께 보내 '다운로드' 폴더에 저장
        view.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
            try {
                startDownload(url, userAgent, mimeType, name);
            } catch (Exception e) {
                Toast.makeText(this, "내려받기에 실패했어요.", Toast.LENGTH_LONG).show();
            }
            // 실패했던 내려받기 주소를 '다시 연결하기'로 다시 열면 그 주소의 브라우저 오류 화면이 남는다.
            // (그대로 두면 '새로고침'이 파일을 또 내려받는다) 스튜디오 화면으로 돌아간다.
            if (url.equals(view.getUrl())) {
                if (view.canGoBack()) view.goBack();
                else view.loadUrl(studioBase);
            }
        });

        FrameLayout screen = new FrameLayout(this);
        screen.addView(view, new FrameLayout.LayoutParams(MATCH, MATCH));
        loadingPanel = buildLoadingPanel();
        screen.addView(loadingPanel, new FrameLayout.LayoutParams(MATCH, MATCH));
        errorPanel = buildErrorPanel();
        screen.addView(errorPanel, new FrameLayout.LayoutParams(MATCH, MATCH));
        setScreen(screen);

        showLoading();
        view.loadUrl(base);
    }

    /** 스튜디오 화면을 정리한다 (주소 입력 화면으로 갈 때·앱을 닫을 때) */
    private void closeStudio() {
        handler.removeCallbacks(revealSlowHint);
        handler.removeCallbacks(giveUp);
        loading = false;
        skipAbortedFinish = false;
        loadingPanel = null;
        slowHint = null;
        errorPanel = null;
        errorDetail = null;
        if (fileCallback != null) {
            fileCallback.onReceiveValue(null);
            fileCallback = null;
        }
        if (web != null) {
            WebView old = web;
            web = null;
            old.stopLoading();
            ViewGroup parent = (ViewGroup) old.getParent();
            if (parent != null) parent.removeView(old);
            old.destroy();
        }
    }

    /** '스튜디오를 여는 중…' 덮개. 잠든 서버가 깨어나는 동안 빈 화면 대신 보인다. */
    private View buildLoadingPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(TILE);
        panel.setPadding(dp(32), dp(24), dp(32), dp(24));
        panel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        // 덮개가 보이는 동안 아래 웹 화면이 눌리지 않게 (다 열리면 덮개가 빠진다)
        panel.setOnTouchListener((v, e) -> true);

        ProgressBar spinner = new ProgressBar(this);
        spinner.setIndeterminate(true);
        spinner.setIndeterminateTintList(ColorStateList.valueOf(PRIMARY));
        spinner.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_NO);
        panel.addView(spinner, new LinearLayout.LayoutParams(dp(44), dp(44)));

        TextView title = text("스튜디오를 여는 중…", 17, INK, true);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams titleLp = new LinearLayout.LayoutParams(WRAP, WRAP);
        titleLp.topMargin = dp(20);
        panel.addView(title, titleLp);

        slowHint = text("서버가 잠들어 있으면 깨어나는 데 30초쯤 걸려요. 조금만 기다려 주세요.", 15, MUTED, false);
        slowHint.setGravity(Gravity.CENTER);
        slowHint.setLineSpacing(0, 1.4f);
        slowHint.setMaxWidth(dp(320));
        slowHint.setVisibility(View.GONE);
        LinearLayout.LayoutParams hintLp = new LinearLayout.LayoutParams(WRAP, WRAP);
        hintLp.topMargin = dp(8);
        panel.addView(slowHint, hintLp);

        panel.setVisibility(View.GONE);
        return panel;
    }

    /** 연결이 안 됐을 때 덮는 화면: 이유 + '다시 연결하기' + '주소 바꾸기' */
    private View buildErrorPanel() {
        LinearLayout card = card();

        card.addView(text("스튜디오에 연결하지 못했어요", 20, ERROR, true), below(0));

        TextView body = text("인터넷이 연결돼 있는지 확인하고 '다시 연결하기'를 눌러 주세요. 서버가 잠들어 있으면 깨어나는 데 30초쯤 걸려요.", 15, INK, false);
        body.setLineSpacing(0, 1.4f);
        card.addView(body, below(10));

        errorDetail = text("", 13, MUTED, false);
        card.addView(errorDetail, below(10));

        Button again = button("다시 연결하기", true);
        again.setOnClickListener(v -> retry());
        card.addView(again, below(20));

        Button change = button("주소 바꾸기", false);
        change.setOnClickListener(v -> showSetup());
        card.addView(change, below(10));

        FrameLayout panel = new FrameLayout(this);
        panel.setBackgroundColor(TILE);
        panel.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        // 카드 밖을 눌러도 아래 웹 화면(브라우저 오류 화면)이 눌리지 않게
        panel.setOnTouchListener((v, e) -> true);
        panel.addView(centered(card), new FrameLayout.LayoutParams(MATCH, MATCH));
        panel.setVisibility(View.GONE);
        return panel;
    }

    /** 페이지를 여는 동안 덮개를 보인다. 6초가 넘으면 서버가 깨어나는 중이라는 줄을 더하고, 90초가 넘으면 그만 기다린다. */
    private void showLoading() {
        if (loadingPanel == null) return;
        loadingPanel.animate().cancel();
        loadingPanel.setAlpha(1f);
        loadingPanel.setVisibility(View.VISIBLE);
        if (!loading) {
            loading = true;
            slowHint.setVisibility(View.GONE);
            handler.removeCallbacks(revealSlowHint);
            handler.postDelayed(revealSlowHint, SLOW_HINT_MS);
            handler.removeCallbacks(giveUp);
            handler.postDelayed(giveUp, GIVE_UP_MS);
        }
        syncWebA11y();
    }

    /** 다 열리면 덮개를 걷는다. 걷힌 덮개는 화면에서 빠지므로 웹 화면을 막지 않는다. */
    private void hideLoading() {
        handler.removeCallbacks(revealSlowHint);
        handler.removeCallbacks(giveUp);
        loading = false;
        final View panel = loadingPanel;
        if (panel == null || panel.getVisibility() != View.VISIBLE) return;
        panel.animate().alpha(0f).setDuration(180).withEndAction(() -> {
            panel.setVisibility(View.GONE);
            syncWebA11y();
        });
    }

    private void showError(String description, String failedUrl) {
        if (errorPanel == null) return;
        retryUrl = failedUrl;
        errorDetail.setText("오류 내용: " + description);
        hideLoading();
        errorPanel.setVisibility(View.VISIBLE);
        syncWebA11y();
    }

    private void hideError() {
        if (errorPanel != null) errorPanel.setVisibility(View.GONE);
        syncWebA11y();
    }

    /** 덮개·오류 화면이 떠 있는 동안에는 화면 읽기(TalkBack)가 아래 웹 화면을 읽거나 누르지 않게 한다 */
    private void syncWebA11y() {
        if (web == null) return;
        boolean covered = (loadingPanel != null && loadingPanel.getVisibility() == View.VISIBLE) || errorShowing();
        web.setImportantForAccessibility(covered
                ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
                : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
    }

    private boolean errorShowing() {
        return errorPanel != null && errorPanel.getVisibility() == View.VISIBLE;
    }

    /** '다시 연결하기': 실패한 주소를 다시 연다 */
    private void retry() {
        if (web == null) return;
        // 앞선 요청이 아직 진행 중이면 그 요청의 '중단' 끝 알림이 새 덮개를 걷지 않게 한다
        skipAbortedFinish = web.getProgress() < 100;
        hideError();
        showLoading();
        web.loadUrl(retryUrl != null ? retryUrl : studioBase);
    }

    /** 스튜디오 서버의 주소인지 (다른 사이트 주소는 '다시 연결하기'로 열지 않는다) */
    private boolean isOurs(String url) {
        if (url == null || studioBase == null) return false;
        String host = Uri.parse(url).getHost();
        return host != null && host.equalsIgnoreCase(Uri.parse(studioBase).getHost());
    }

    /** 붙여 넣을 때 딸려 오는 보이지 않는 글자(폭 없는 공백·방향 표시 등)를 지우고, 앞뒤 공백(줄바꿈 없는 공백·전각 공백 포함)을 떼어 낸다 */
    static String cleanUrl(String u) {
        String s = u.replaceAll("\\p{Cf}", "");
        int a = 0;
        int b = s.length();
        while (a < b && (s.charAt(a) <= ' ' || Character.isSpaceChar(s.charAt(a)))) a++;
        while (b > a && (s.charAt(b - 1) <= ' ' || Character.isSpaceChar(s.charAt(b - 1)))) b--;
        return s.substring(a, b);
    }

    /**
     * 웹 화면이 실제로 열 수 있는 주소인지.
     * URLUtil.isValidUrl은 앞의 http(s)://만 보므로 '192.168.0.10:5178o'·'192.168.0.10 :5178' 같은 오타도 통과시키고,
     * 웹 화면은 그런 주소를 아무 알림 없이 열지 않는다 (그러면 '여는 중'이 끝나지 않는다).
     * 숫자는 \d가 아니라 [0-9]로 본다: 휴대폰의 \d는 전각·아랍 숫자도 받지만, 웹 화면은 포트에 0~9만 받아서 그런 주소를 아무 알림 없이 열지 않는다.
     * 또 두 글자(서로게이트 쌍)로 저장되는 숫자는 Integer.parseInt가 읽지 못하고 예외를 내서 앱이 멈춘다.
     */
    static boolean isLoadableUrl(String u) {
        if (u == null || !URLUtil.isNetworkUrl(u) || u.matches("(?s).*\\s.*")) return false;
        String auth = Uri.parse(u).getEncodedAuthority();
        if (auth == null) return false;
        auth = auth.substring(auth.lastIndexOf('@') + 1);
        String host = auth;
        int colon = auth.lastIndexOf(':');
        if (colon > auth.lastIndexOf(']')) {
            String port = auth.substring(colon + 1);
            if (!port.isEmpty() && (!port.matches("[0-9]{1,5}") || Integer.parseInt(port) > 65535)) return false;
            host = auth.substring(0, colon);
        }
        if (host.isEmpty()) return false;
        // [ ]로 감싼 주소는 IPv6여야 한다 ('[fe80::1:5178'처럼 ']'를 빠뜨린 오타도 웹 화면은 아무 알림 없이 열지 않는다)
        if (host.startsWith("[")) return host.endsWith("]") && isIpv6(host.substring(1, host.length() - 1));
        // 포트를 떼고도 ':'가 남으면(mypc::5178, :5178:5178 같은 오타) 웹 화면은 열지 않는다
        if (host.indexOf(':') >= 0) return false;
        // 주소에 쓸 수 없는 글자
        if (host.matches(".*[\\[\\]<>^|%].*")) return false;
        // 영문 밖의 글자는 한글 같은 문자만 받는다 (전각 '：'·'．' 같은 글자는 열리지 않는다. 보이지 않는 글자는 cleanUrl이 먼저 지운다)
        for (int k = 0; k < host.length(); k++) {
            char c = host.charAt(k);
            if (c <= 0x20 || c == 0x7F || (c > 0x7F && !Character.isLetter(c))) return false;
        }
        // 마지막 칸이 숫자면 주소 전체가 IPv4여야 한다 (URL 표준).
        // 192.168.o.10 · 192.168,0.10 · 192.168.0.08 같은 오타는 웹 화면이 아무 알림 없이 열지 않는다
        String h = host.endsWith(".") ? host.substring(0, host.length() - 1) : host;
        String last = h.substring(h.lastIndexOf('.') + 1);
        return !last.matches("[0-9]+|0[xX][0-9a-fA-F]*") || isDottedQuad(h);
    }

    /** 점으로 나눈 네 칸이 모두 0~255인 IPv4 주소인지 (0으로 시작하는 두 자리 이상 칸은 받지 않는다) */
    static boolean isDottedQuad(String h) {
        String[] parts = h.split("\\.", -1);
        if (parts.length != 4) return false;
        for (String part : parts) {
            if (!part.matches("0|[1-9][0-9]{0,2}") || Integer.parseInt(part) > 255) return false;
        }
        return true;
    }

    /** URL 표준의 IPv6 주소인지: 1~4자리 16진수 8칸. '::'는 한 번만 쓰고 그러면 7칸 이하, 마지막 칸은 IPv4여도 된다. */
    static boolean isIpv6(String s) {
        int gap = s.indexOf("::");
        if (gap >= 0 && s.indexOf("::", gap + 1) >= 0) return false;
        String[] sides = gap >= 0 ? new String[] {s.substring(0, gap), s.substring(gap + 2)} : new String[] {s};
        int groups = 0;
        for (int i = 0; i < sides.length; i++) {
            if (sides[i].isEmpty()) continue;
            String[] parts = sides[i].split(":", -1);
            for (int k = 0; k < parts.length; k++) {
                String p = parts[k];
                if (i == sides.length - 1 && k == parts.length - 1 && p.indexOf('.') >= 0) {
                    if (!isDottedQuad(p)) return false;
                    groups += 2;
                } else if (p.matches("[0-9a-fA-F]{1,4}")) {
                    groups++;
                } else {
                    return false;
                }
            }
        }
        return gap >= 0 ? groups <= 7 : groups == 8;
    }

    // ── 파일 올리기·사진 찍기 ──

    /**
     * 파일 고르기 창. 사진을 받는 칸이면 '사진 찍기'(카메라)도 함께 보여 준다 (안드로이드 10 이상, 권한 필요 없음).
     * 찍은 사진은 사진첩의 '맛연구소' 앨범에 저장된다.
     */
    private Intent fileChooser(WebChromeClient.FileChooserParams params) {
        Intent pick = params.createIntent();
        if (Build.VERSION.SDK_INT < 29 || !acceptsImages(params)) return pick;
        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (camera.resolveActivity(getPackageManager()) == null) return pick;
        try {
            ContentValues photo = new ContentValues();
            photo.put(MediaStore.Images.Media.DISPLAY_NAME, "recipe-" + System.currentTimeMillis() + ".jpg");
            photo.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            photo.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/맛연구소");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, photo);
        } catch (Exception e) {
            cameraUri = null;
        }
        if (cameraUri == null) return pick;
        camera.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(pick, "사진 찍기 또는 파일 고르기");
        chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {camera});
        return chooser;
    }

    /** 사진을 받는 칸인지 (accept에 image/가 있거나, 아무 파일이나 받는 칸) */
    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null) return true;
        boolean any = false;
        for (String t : types) {
            if (t == null) continue;
            String s = t.trim().toLowerCase(Locale.ROOT);
            if (s.isEmpty()) continue;
            any = true;
            if (s.startsWith("image/") || s.equals("*/*") || s.equals(".jpg") || s.equals(".jpeg") || s.equals(".png")
                    || s.equals(".webp") || s.equals(".heic") || s.equals(".heif")) return true;
        }
        return !any;
    }

    /**
     * 고른 파일들.
     * - 여러 개를 고르면 ClipData로만 온다 (FileChooserParams.parseResult는 하나만 읽어 아무것도 넘기지 못한다)
     * - 카메라로 찍었으면 결과에 주소가 없고, 미리 만들어 둔 사진 칸에 저장돼 있다
     */
    private Uri[] pickedFiles(int resultCode, Intent data) {
        Uri photo = cameraUri;
        cameraUri = null;
        Uri[] picked = null;
        if (resultCode == RESULT_OK) {
            ClipData clip = data != null ? data.getClipData() : null;
            if (clip != null) {
                ArrayList<Uri> uris = new ArrayList<>();
                for (int i = 0; i < clip.getItemCount(); i++) {
                    Uri u = clip.getItemAt(i).getUri();
                    if (u != null) uris.add(u);
                }
                if (!uris.isEmpty()) picked = uris.toArray(new Uri[0]);
            }
            if (picked == null && data != null && data.getData() != null) picked = new Uri[] {data.getData()};
            if (picked == null && photo != null && hasContent(photo)) picked = new Uri[] {photo};
        }
        // 카메라용으로 만들어 둔 사진 칸을 쓰지 않았으면 지운다 (빈 사진이 사진첩에 남지 않게)
        if (photo != null && (picked == null || !Arrays.asList(picked).contains(photo))) discardPhoto(photo);
        return picked;
    }

    private boolean hasContent(Uri u) {
        try (ParcelFileDescriptor fd = getContentResolver().openFileDescriptor(u, "r")) {
            return fd != null && fd.getStatSize() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private void discardPhoto(Uri u) {
        if (u == null) return;
        try {
            getContentResolver().delete(u, null, null);
        } catch (Exception ignored) {
            // 지우지 못해도 빈 칸 하나가 남을 뿐이다
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            Uri[] picked = pickedFiles(resultCode, data);
            if (fileCallback != null) {
                fileCallback.onReceiveValue(picked);
                fileCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    // ── 내려받기 ──

    /**
     * 공용 '다운로드' 폴더에 저장한다 (사진첩·인스타그램에서 바로 고를 수 있게).
     * 안드로이드 9 이하는 그러려면 저장 권한이 있어야 해서 먼저 묻고, 거절하면 앱 전용 폴더에 저장한다.
     */
    @SuppressWarnings("deprecation")
    private void startDownload(String url, String userAgent, String mimeType, String name) {
        // 주소가 잘못됐으면 권한을 묻기 전에 여기서 실패한다 (기다리는 동안에는 문자열만 두고, 보낼 때 다시 만든다)
        DownloadManager.Request r = newRequest(url, userAgent, mimeType, name);
        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingDownloads.addAll(Arrays.asList(url, userAgent, mimeType, name));
            // 이미 묻는 중이면 다시 묻지 않는다 (다시 부르면 Activity가 곧바로 빈 결과를 보내 앞의 내려받기를 잃는다)
            if (pendingDownloads.size() == 4) {
                try {
                    requestPermissions(new String[] {Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
                } catch (Exception e) {
                    pendingDownloads.clear();
                    Toast.makeText(this, "내려받기에 실패했어요.", Toast.LENGTH_LONG).show();
                }
            }
            return;
        }
        r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        if (Build.VERSION.SDK_INT < 29) r.allowScanningByMediaScanner();
        enqueue(r, "내려받는 중: " + name);
    }

    /** 로그인 쿠키를 함께 보내는 내려받기 요청 (쿠키는 보낼 때 새로 읽는다) */
    private DownloadManager.Request newRequest(String url, String userAgent, String mimeType, String name) {
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
        r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
        r.addRequestHeader("User-Agent", userAgent);
        r.setMimeType(mimeType);
        r.setTitle(name);
        r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        return r;
    }

    private void enqueue(DownloadManager.Request r, String message) {
        try {
            ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, "내려받기에 실패했어요.", Toast.LENGTH_LONG).show();
        }
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == REQ_STORAGE && !pendingDownloads.isEmpty()) {
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            // 목록을 먼저 비운다 (아래에서 새 내려받기가 들어와도 섞이지 않게)
            ArrayList<String> waiting = new ArrayList<>(pendingDownloads);
            pendingDownloads.clear();
            for (int i = 0; i + 3 < waiting.size(); i += 4) {
                String name = waiting.get(i + 3);
                try {
                    DownloadManager.Request r = newRequest(waiting.get(i), waiting.get(i + 1), waiting.get(i + 2), name);
                    if (granted) {
                        r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                        r.allowScanningByMediaScanner();
                        enqueue(r, "내려받는 중: " + name);
                    } else {
                        // 거절하면 앱 전용 폴더에 저장한다 (다 받으면 알림을 눌러 열 수 있다)
                        r.setDestinationInExternalFilesDir(this, Environment.DIRECTORY_DOWNLOADS, name);
                        enqueue(r, "앱 폴더에 내려받는 중: " + name);
                    }
                } catch (Exception e) {
                    Toast.makeText(this, "내려받기에 실패했어요.", Toast.LENGTH_LONG).show();
                }
            }
            return;
        }
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, MENU_RELOAD, 0, "새로고침");
        menu.add(0, MENU_CHANGE_URL, 1, "스튜디오 주소 바꾸기");
        return true;
    }

    @Override
    public boolean onPrepareOptionsMenu(Menu menu) {
        // 주소 입력 화면에서는 새로고침·주소 바꾸기가 할 일이 없으니 감춘다
        boolean studio = web != null;
        MenuItem reload = menu.findItem(MENU_RELOAD);
        if (reload != null) reload.setVisible(studio);
        MenuItem change = menu.findItem(MENU_CHANGE_URL);
        if (change != null) change.setVisible(studio);
        return super.onPrepareOptionsMenu(menu);
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == MENU_RELOAD && web != null) {
            if (errorShowing()) {
                retry();
            } else {
                // 아직 여는 중이면 앞선 요청의 '중단' 끝 알림이 덮개를 걷지 않게 한다
                skipAbortedFinish = loading;
                showLoading();
                web.reload();
            }
            return true;
        }
        if (item.getItemId() == MENU_CHANGE_URL) {
            new AlertDialog.Builder(this)
                .setMessage("스튜디오 주소를 바꿀까요?")
                .setPositiveButton("바꾸기", (d, w) -> showSetup())
                .setNegativeButton("취소", null)
                .show();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    // ── 창·여백 ──

    /** 상태 표시줄·내비게이션 막대·위쪽 막대를 바탕색(청자 타일)에 맞추고 아이콘은 어둡게 */
    @SuppressWarnings("deprecation")
    private void styleWindow() {
        Window w = getWindow();
        // 안드로이드 15부터는 시스템 막대가 투명해져 이 창 바탕이 비친다 (3버튼 내비게이션도 창 바탕색을 따른다)
        w.setBackgroundDrawable(new ColorDrawable(TILE));
        w.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS | WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION);
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        w.setStatusBarColor(TILE);
        w.setNavigationBarColor(TILE);
        View decor = w.getDecorView();
        decor.setSystemUiVisibility(decor.getSystemUiVisibility()
                | View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = decor.getWindowInsetsController();
            if (c != null) {
                int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                        | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                c.setSystemBarsAppearance(light, light);
            }
        }
        ActionBar bar = getActionBar();
        if (bar != null) {
            bar.setBackgroundDrawable(new ColorDrawable(TILE));
            bar.setElevation(0);
        }
    }

    /**
     * 안드로이드 15 이상(앱 목표 35)은 화면이 시스템 막대 아래까지 그려진다.
     * 바깥 틀에 막대·키보드만큼 여백을 두어 웹 화면 아래쪽 탭과 입력칸이 가리지 않게 한다.
     * 그 전 버전은 시스템이 이미 여백을 처리하므로 여기 들어오는 값이 0이다.
     */
    @SuppressWarnings("deprecation")
    private void fitSystemBars(View root) {
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout()
                        | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
            } else {
                v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            // 안쪽(웹 화면)에는 다시 넘기지 않는다: 여백을 두 번 두지 않게
            // WindowInsets.CONSUMED는 API 30부터 공개 필드다 (29에서 읽으면 숨은 API 경고)
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
    }

    private void setScreen(View screen) {
        appRoot.removeAllViews();
        appRoot.addView(screen, new FrameLayout.LayoutParams(MATCH, MATCH));
        invalidateOptionsMenu();
    }

    private void hideKeyboard(View v) {
        InputMethodManager imm = (InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE);
        if (imm != null) imm.hideSoftInputFromWindow(v.getWindowToken(), 0);
    }

    // ── 화면 조각 (웹의 .card · .btn 과 같은 모양) ──

    private int dp(float value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private TextView text(CharSequence s, float sp, int color, boolean bold) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        // 한국어는 낱말 중간이 아니라 띄어쓰기에서 줄을 바꾼다 (웹의 word-break: keep-all)
        t.setTextLocale(Locale.KOREA);
        if (Build.VERSION.SDK_INT >= 33) t.setLineBreakWordStyle(LineBreakConfig.LINE_BREAK_WORD_STYLE_PHRASE);
        return t;
    }

    private LinearLayout.LayoutParams below(int topMarginDp) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(MATCH, WRAP);
        lp.topMargin = dp(topMarginDp);
        return lp;
    }

    private GradientDrawable rounded(int fill, int stroke, int strokeDp, float radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(dp(radiusDp));
        if (strokeDp > 0) g.setStroke(dp(strokeDp), stroke);
        return g;
    }

    /** 백자 면 카드. 넓은 화면(태블릿·가로)에서도 440dp보다 넓어지지 않는다. */
    private LinearLayout card() {
        final int maxWidth = dp(440);
        LinearLayout c = new LinearLayout(this) {
            @Override
            protected void onMeasure(int widthMeasureSpec, int heightMeasureSpec) {
                if (MeasureSpec.getSize(widthMeasureSpec) > maxWidth) {
                    widthMeasureSpec = MeasureSpec.makeMeasureSpec(maxWidth, MeasureSpec.EXACTLY);
                }
                super.onMeasure(widthMeasureSpec, heightMeasureSpec);
            }
        };
        c.setOrientation(LinearLayout.VERTICAL);
        c.setBackground(rounded(PAPER, LINE, 1, 16));
        c.setPadding(dp(24), dp(24), dp(24), dp(24));
        return c;
    }

    /** 카드 하나를 가운데 두는 화면 틀. 키보드가 올라오거나 글자를 키워도 밀어서 볼 수 있다. */
    private ScrollView centered(View card) {
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setGravity(Gravity.CENTER);
        page.setPadding(dp(16), dp(24), dp(16), dp(24));
        page.addView(card, new LinearLayout.LayoutParams(MATCH, WRAP));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(TILE);
        scroll.addView(page, new FrameLayout.LayoutParams(MATCH, WRAP));
        return scroll;
    }

    /** 주요 버튼은 고추장 바탕 흰 글자 52dp, 보조 버튼은 백자 바탕 테두리 48dp. 둘 다 폭을 꽉 채운다. */
    private Button button(String label, boolean primary) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        b.setTextColor(primary ? Color.WHITE : INK);
        b.setStateListAnimator(null);
        b.setElevation(0);
        int height = dp(primary ? 52 : 48);
        b.setMinHeight(height);
        b.setMinimumHeight(height);
        GradientDrawable shape = primary ? rounded(PRIMARY, 0, 0, 10) : rounded(PAPER, LINE_STRONG, 1, 10);
        int ripple = primary ? 0x40FFFFFF : 0x1F241C17;
        b.setBackground(new RippleDrawable(ColorStateList.valueOf(ripple), shape, null));
        b.setPadding(dp(20), dp(10), dp(20), dp(10));
        return b;
    }

    /** 입력칸: 흰 바탕 둥근 테두리, 누르면 파란 테두리 (웹 입력칸과 같음) */
    private StateListDrawable fieldBackground() {
        StateListDrawable d = new StateListDrawable();
        d.addState(new int[] {android.R.attr.state_focused}, rounded(Color.WHITE, FOCUS, 2, 10));
        d.addState(new int[] {}, rounded(Color.WHITE, LINE_STRONG, 1, 10));
        return d;
    }
}
