package dev.vertal.node.capacitor;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;

/**
 * Cria o cliente do Cash Raven na partida do processo (antes da WebView), para o serviço em primeiro
 * plano e o CrBootReceiver acharem o SDK configurado. NÃO pede consentimento e NÃO inicia nada.
 */
public final class VertalNodeInitProvider extends ContentProvider {
    @Override
    public boolean onCreate() {
        if (getContext() != null) VertalNodeCore.init(getContext());
        return true;
    }

    @Override public Cursor query(Uri u, String[] p, String s, String[] a, String o) { return null; }
    @Override public String getType(Uri u) { return null; }
    @Override public Uri insert(Uri u, ContentValues v) { return null; }
    @Override public int delete(Uri u, String s, String[] a) { return 0; }
    @Override public int update(Uri u, ContentValues v, String s, String[] a) { return 0; }
}
