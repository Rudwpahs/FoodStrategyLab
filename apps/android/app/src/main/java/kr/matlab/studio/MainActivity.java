package kr.matlab.studio;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.InputType;
import android.view.Gravity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.ViewGroup;
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
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * 맛 연구소 스튜디오 앱.
 * 영상·음성 제작은 클라우드 스튜디오 서버(Modal)에서 하고, 이 앱은 그 화면을 휴대폰에서 연다.
 * - 설치하면 바로 클라우드 주소가 열린다 (연결이 안 되거나 메뉴의 '스튜디오 주소 바꾸기'를 누르면 주소 입력 화면)
 * - 사진 찍기·사진/파일 고르기, ZIP·이미지 내려받기 지원
 * - https 주소만 연다 (예전 집 네트워크·Tailscale용 http 허용은 뺐다)
 * - 인스타그램·네이버 같은 다른 사이트 링크는 휴대폰 브라우저로 연다
 */
public class MainActivity extends Activity {
    private static final String PREFS = "matlab";
    private static final String KEY_URL = "studio_url";
    /** 클라우드 스튜디오 주소 (Modal). 설치하면 바로 이 주소가 열린다. 메뉴의 '스튜디오 주소 바꾸기'로 바꿀 수 있다. */
    private static final String DEFAULT_URL = "https://rudwpahs--matlab-studio-web.us-east.modal.run";
    private static final int REQ_FILE = 1;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    /** 카메라로 찍을 때 사진이 들어갈 자리 */
    private Uri pendingPhoto;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        String url = prefs().getString(KEY_URL, "");
        showStudio(url.isEmpty() ? DEFAULT_URL : url);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, MODE_PRIVATE);
    }

    /** 스튜디오 주소 입력 화면 */
    private void showSetup(String error) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(48, 96, 48, 48);
        box.setBackgroundColor(Color.parseColor("#FFF4E2"));

        TextView title = new TextView(this);
        title.setText("이희재의 맛 연구소 스튜디오");
        title.setTextSize(22);
        title.setTextColor(Color.parseColor("#2B2321"));
        box.addView(title);

        TextView help = new TextView(this);
        help.setText("스튜디오 주소를 입력하세요.\n보통은 이미 채워진 클라우드 주소 그대로 '연결하기'를 누르면 돼요.\n\n영상과 목소리는 클라우드 서버에서 만들어지고, 이 앱은 그 화면을 휴대폰에서 보여 줘요.");
        help.setTextSize(15);
        help.setPadding(0, 24, 0, 24);
        box.addView(help);

        if (error != null) {
            TextView err = new TextView(this);
            err.setText(error);
            err.setTextColor(Color.parseColor("#C0392B"));
            err.setPadding(0, 0, 0, 16);
            box.addView(err);
        }

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://");
        input.setText(prefs().getString(KEY_URL, DEFAULT_URL));
        box.addView(input, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button save = new Button(this);
        save.setText("연결하기");
        save.setOnClickListener(v -> {
            String u = input.getText().toString().trim();
            if (!u.startsWith("http://") && !u.startsWith("https://")) u = "https://" + u;
            if (u.endsWith("/")) u = u.substring(0, u.length() - 1);
            if (!URLUtil.isValidUrl(u)) {
                Toast.makeText(this, "주소를 다시 확인해 주세요.", Toast.LENGTH_LONG).show();
                return;
            }
            prefs().edit().putString(KEY_URL, u).apply();
            showStudio(u);
        });
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = 24;
        box.addView(save, lp);
        box.setGravity(Gravity.TOP);
        web = null;
        setContentView(box);
    }

    /** 스튜디오 화면 */
    private void showStudio(final String base) {
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setAllowFileAccess(false);
        CookieManager.getInstance().setAcceptCookie(true);

        final Uri baseUri = Uri.parse(base);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                // 스튜디오 밖 링크(인스타그램·네이버 등)는 휴대폰 브라우저로
                if (u.getHost() != null && !u.getHost().equals(baseUri.getHost())) {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                    return true;
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showSetup("스튜디오에 연결하지 못했어요 (" + error.getDescription() + "). 인터넷이 연결돼 있는지 확인하고 '연결하기'를 다시 눌러 주세요. 서버가 잠들어 있으면 깨어나는 데 30초쯤 걸려요.");
                }
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                pendingPhoto = null;
                try {
                    Intent chooser = Intent.createChooser(params.createIntent(), "사진·파일 고르기");
                    // 사진을 받는 칸이면 '사진 찍기'(카메라)도 함께 보여 준다
                    if (acceptsImages(params)) {
                        pendingPhoto = PhotoProvider.newPhotoUri(MainActivity.this);
                        Intent camera = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                        camera.putExtra(MediaStore.EXTRA_OUTPUT, pendingPhoto);
                        camera.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        if (camera.resolveActivity(getPackageManager()) != null) {
                            chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {camera});
                        } else {
                            pendingPhoto = null;
                        }
                    }
                    startActivityForResult(chooser, REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "파일을 고를 수 없어요.", Toast.LENGTH_LONG).show();
                    return false;
                }
                return true;
            }
        });
        // ZIP·이미지 내려받기: 로그인 쿠키를 함께 보내 '다운로드' 폴더에 저장
        web.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            try {
                String name = URLUtil.guessFileName(url, contentDisposition, mimeType);
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                r.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
                r.addRequestHeader("User-Agent", userAgent);
                r.setMimeType(mimeType);
                r.setTitle(name);
                r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
                Toast.makeText(this, "내려받는 중: " + name, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, "내려받기에 실패했어요.", Toast.LENGTH_LONG).show();
            }
        });
        setContentView(web);
        web.loadUrl(base);
    }

    /** 받는 파일 종류에 사진이 들어 있는지 (종류를 정하지 않았으면 사진도 받는다) */
    private static boolean acceptsImages(WebChromeClient.FileChooserParams params) {
        String[] types = params.getAcceptTypes();
        if (types == null || types.length == 0) return true;
        for (String t : types) {
            for (String one : t.split(",")) {
                String s = one.trim().toLowerCase();
                if (s.isEmpty() || s.startsWith("image/") || s.equals(".heic") || s.equals(".jpg") || s.equals(".jpeg") || s.equals(".png")) return true;
            }
        }
        return false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] picked = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            // 카메라 앱은 보통 결과에 주소를 주지 않는다: 사진 자리에 사진이 들어왔으면 그것을 쓴다
            if (picked == null && resultCode == RESULT_OK && pendingPhoto != null && PhotoProvider.hasPhoto(this, pendingPhoto)) {
                picked = new Uri[] {pendingPhoto};
            }
            fileCallback.onReceiveValue(picked);
            fileCallback = null;
            pendingPhoto = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "새로고침");
        menu.add(0, 2, 1, "스튜디오 주소 바꾸기");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == 1 && web != null) {
            web.reload();
            return true;
        }
        if (item.getItemId() == 2) {
            new AlertDialog.Builder(this)
                .setMessage("스튜디오 주소를 바꿀까요?")
                .setPositiveButton("바꾸기", (d, w) -> showSetup(null))
                .setNegativeButton("취소", null)
                .show();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }
}
