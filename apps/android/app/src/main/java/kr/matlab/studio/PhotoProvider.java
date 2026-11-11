package kr.matlab.studio;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 카메라 앱이 찍은 사진을 넣을 자리 (앱 안 임시 폴더).
 * 카메라 앱에는 이 주소에 쓰는 권한만 잠깐 준다. 다른 앱에는 열려 있지 않다(exported=false).
 * 사진마다 새 이름을 써서, 아직 올리지 않은 앞 사진을 덮어쓰지 않는다. 하루 지난 사진은 지운다.
 */
public class PhotoProvider extends ContentProvider {
    static final String AUTHORITY = "kr.matlab.studio.photo";
    private static final long KEEP_MS = 24L * 60 * 60 * 1000;

    static File dir(Context c) {
        File d = new File(c.getCacheDir(), "camera");
        if (!d.isDirectory()) d.mkdirs();
        return d;
    }

    /** 새 사진 자리 하나를 만든다 (하루 지난 사진은 정리) */
    static Uri newPhotoUri(Context c) {
        File[] old = dir(c).listFiles();
        if (old != null) {
            long now = System.currentTimeMillis();
            for (File f : old) if (now - f.lastModified() > KEEP_MS) f.delete();
        }
        return Uri.parse("content://" + AUTHORITY + "/photo-" + System.currentTimeMillis() + ".jpg");
    }

    /** 카메라가 실제로 사진을 넣었는지 */
    static boolean hasPhoto(Context c, Uri uri) {
        File f = fileFor(c, uri);
        return f != null && f.length() > 0;
    }

    private static File fileFor(Context c, Uri uri) {
        String name = uri.getLastPathSegment();
        if (name == null || !name.matches("photo-\\d+\\.jpg")) return null;
        return new File(dir(c), name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File f = fileFor(getContext(), uri);
        if (f == null) throw new FileNotFoundException(String.valueOf(uri));
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.parseMode(mode));
    }

    @Override
    public String getType(Uri uri) {
        return "image/jpeg";
    }

    /** 파일 고르기(웹뷰)가 이름과 크기를 물어볼 때 */
    @Override
    public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
        File f = fileFor(getContext(), uri);
        MatrixCursor cursor = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
        if (f != null) cursor.addRow(new Object[] {f.getName(), f.length()});
        return cursor;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
