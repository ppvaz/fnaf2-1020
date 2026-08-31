package com.fnaf2.cuehelper;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/** Read-only provider for recordings exported from the APK without ADB. */
public final class CaptureFileProvider extends ContentProvider {
    private static final String ROOT = "audio-captures";

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public String getType(Uri uri) {
        return "audio/wav";
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode)
            throws FileNotFoundException {
        if (!"r".equals(mode)) {
            throw new FileNotFoundException("read-only provider");
        }
        return ParcelFileDescriptor.open(resolve(uri),
                ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
            String[] selectionArgs, String sortOrder) {
        File file;
        try {
            file = resolve(uri);
        } catch (FileNotFoundException error) {
            return null;
        }
        String[] columns = projection == null
                ? new String[]{"_display_name", "_size"} : projection;
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int index = 0; index < columns.length; index++) {
            row[index] = "_display_name".equals(columns[index]) ? file.getName()
                    : "_size".equals(columns[index]) ? file.length() : null;
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection,
            String[] selectionArgs) {
        return 0;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        if (getContext() == null || uri == null || uri.getPathSegments().size() != 2
                || !ROOT.equals(uri.getPathSegments().get(0))) {
            throw new FileNotFoundException("invalid capture URI");
        }
        String name = Uri.decode(uri.getPathSegments().get(1));
        if (name.isEmpty() || name.contains("/") || name.contains("\\")
                || !name.endsWith(".wav")) {
            throw new FileNotFoundException("invalid capture name");
        }
        File directory = new File(getContext().getFilesDir(), ROOT);
        File file = new File(directory, name);
        try {
            String directoryPath = directory.getCanonicalPath();
            String filePath = file.getCanonicalPath();
            if (!filePath.startsWith(directoryPath + File.separator)
                    || !file.isFile()) {
                throw new FileNotFoundException("capture not found");
            }
        } catch (IOException error) {
            throw new FileNotFoundException("capture path unavailable");
        }
        return file;
    }
}
