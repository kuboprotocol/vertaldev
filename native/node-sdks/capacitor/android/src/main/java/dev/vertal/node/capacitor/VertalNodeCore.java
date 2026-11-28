package dev.vertal.node.capacitor;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import io.cashraven.sdk.CashRaven;
import io.cashraven.sdk.CashRavenService;
import java.util.UUID;

/**
 * Cliente único do Cash Raven SDK no app Capacitor (modo SDK-managed).
 * Regras: consentimento só pela tela DO SDK (nunca chamamos optIn()); opt-out sempre disponível;
 * nada inicia sem consentimento; "pausado pelo usuário" não religa sozinho.
 */
final class VertalNodeCore {
    private static final String TAG = "VertalNode";
    private static final String PREFS = "vertal_node_capacitor";
    private static final String KEY_DEVICE_ID = "device_id";
    private static final String KEY_USER_PAUSED = "user_paused";

    private static CashRaven client;
    private static String unavailableReason;

    private VertalNodeCore() {}

    /** Cria o cliente uma vez (ContentProvider / plugin). Nunca lança. */
    static synchronized CashRaven init(Context context) {
        if (client != null || unavailableReason != null) return client;
        Context app = context.getApplicationContext();
        String key = BuildConfig.CASHRAVEN_API_KEY;
        if (key == null || key.trim().isEmpty()) {
            unavailableReason = "api_key_missing";
            Log.w(TAG, "CASHRAVEN_API_KEY_ANDROID ausente no build: Vertal Node desligado.");
            return null;
        }
        try {
            CashRaven cr = CashRaven.createManaged(app, key.trim(), deviceId(app)); // começa OPTED-OUT
            CashRavenService.configure(cr, new CashRavenService.Config(R.drawable.ic_vertal_node_notification, launchActivity(app)));
            client = cr;
        } catch (Throwable t) {
            unavailableReason = "sdk_init_failed";
            Log.e(TAG, "init do Cash Raven SDK falhou", t);
        }
        return client;
    }

    static String unavailableReason() {
        return unavailableReason;
    }

    static String deviceId(Context context) {
        SharedPreferences p = prefs(context);
        String id = p.getString(KEY_DEVICE_ID, null);
        if (id == null) {
            id = "cap-" + UUID.randomUUID();
            p.edit().putString(KEY_DEVICE_ID, id).apply();
        }
        return id;
    }

    static boolean isPaused(Context context) {
        return prefs(context).getBoolean(KEY_USER_PAUSED, false);
    }

    static boolean isOptedIn() {
        return client != null && client.isOptedIn();
    }

    static boolean isRunning() {
        return client != null && client.isRunning();
    }

    /** Só com consentimento. Retorna false se o Android recusar o serviço (ex.: app em segundo plano). */
    static boolean startAfterConsent(Context context) {
        if (client == null || !client.isOptedIn()) return false;
        prefs(context).edit().putBoolean(KEY_USER_PAUSED, false).apply();
        try {
            CashRavenService.start(context.getApplicationContext()); // idempotente
            client.setStartOnBoot(context.getApplicationContext(), true);
            return true;
        } catch (Throwable t) {
            Log.w(TAG, "start do serviço falhou", t);
            return false;
        }
    }

    /** Retoma na abertura do app se o usuário aceitou e não pausou. Nunca pede consentimento. */
    static void resumeIfConsented(Context context) {
        if (client == null || !client.isOptedIn() || isPaused(context) || client.isRunning()) return;
        try {
            CashRavenService.start(context.getApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "retomar falhou", t);
        }
    }

    static void pause(Context context) {
        prefs(context).edit().putBoolean(KEY_USER_PAUSED, true).apply();
        if (client == null) return;
        try {
            CashRavenService.stop(context.getApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "pausar falhou", t);
        }
    }

    static void optOut(Context context) {
        prefs(context).edit().putBoolean(KEY_USER_PAUSED, true).apply();
        if (client == null) return;
        try {
            client.setStartOnBoot(context.getApplicationContext(), false);
            client.optOut(); // retira o consentimento no SDK
            CashRavenService.stop(context.getApplicationContext());
        } catch (Throwable t) {
            Log.w(TAG, "opt-out falhou", t);
        }
    }

    static CashRaven client() {
        return client;
    }

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Tocar na notificação abre o app. */
    private static Class<?> launchActivity(Context app) {
        try {
            Intent i = app.getPackageManager().getLaunchIntentForPackage(app.getPackageName());
            if (i != null && i.getComponent() != null) return Class.forName(i.getComponent().getClassName());
        } catch (Throwable ignored) {
            // sem activity de lançamento: a notificação só não abre nada
        }
        return null;
    }
}
