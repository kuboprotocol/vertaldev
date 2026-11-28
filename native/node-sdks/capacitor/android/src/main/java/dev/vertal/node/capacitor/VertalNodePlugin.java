package dev.vertal.node.capacitor;

import android.Manifest;
import android.app.Activity;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import io.cashraven.sdk.CashRaven;
import io.cashraven.sdk.CrConsentResult;

/**
 * Plugin "VertalNode" (Android). O painel de recompensas chama activate() no toque do usuário, depois
 * de gravar o aceite em vertal_node_consents. activate() mostra a tela de consentimento DA CASH RAVEN
 * (nomeia o fornecedor, termos e privacidade) e só inicia o serviço em primeiro plano (com notificação
 * fixa) depois do aceite. pause() e optOut() sempre disponíveis.
 */
@CapacitorPlugin(
    name = "VertalNode",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) }
)
public class VertalNodePlugin extends Plugin {

    @Override
    public void load() {
        VertalNodeCore.init(getContext());
        // App aberto (primeiro plano): retoma só se já aceitou e não pausou.
        VertalNodeCore.resumeIfConsented(getContext());
    }

    @PluginMethod
    public void status(PluginCall call) {
        call.resolve(state());
    }

    @PluginMethod
    public void activate(PluginCall call) {
        if (VertalNodeCore.init(getContext()) == null) {
            JSObject r = state();
            r.put("accepted", false);
            call.resolve(r);
            return;
        }
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "afterNotificationPermission");
            return;
        }
        consentThenStart(call);
    }

    /** Negar a notificação não impede: o serviço roda, só a notificação fica oculta (Android 13+). */
    @PermissionCallback
    private void afterNotificationPermission(PluginCall call) {
        consentThenStart(call);
    }

    private void consentThenStart(PluginCall call) {
        CashRaven cr = VertalNodeCore.client();
        Activity activity = getActivity();
        if (cr == null || activity == null) {
            JSObject r = state();
            r.put("accepted", false);
            call.resolve(r);
            return;
        }
        if (cr.isOptedIn()) {
            resolveActivated(call, true);
            return;
        }
        // Tela DO SDK; no aceite o próprio SDK chama optIn(). Não mostra nada se a decisão já existe.
        activity.runOnUiThread(() -> cr.requestConsent(activity, result -> {
            boolean granted = result == CrConsentResult.GRANTED;
            activity.runOnUiThread(() -> resolveActivated(call, granted));
        }));
    }

    private void resolveActivated(PluginCall call, boolean accepted) {
        if (accepted) VertalNodeCore.startAfterConsent(getContext());
        JSObject r = state();
        r.put("accepted", accepted && VertalNodeCore.isOptedIn());
        call.resolve(r);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        VertalNodeCore.pause(getContext());
        call.resolve(state());
    }

    @PluginMethod
    public void optOut(PluginCall call) {
        VertalNodeCore.optOut(getContext());
        call.resolve(state());
    }

    private JSObject state() {
        JSObject s = new JSObject();
        String reason = VertalNodeCore.unavailableReason();
        boolean available = VertalNodeCore.client() != null;
        s.put("available", available);
        if (!available) s.put("reason", reason != null ? reason : "sdk_init_failed");
        s.put("provider", "cashraven");
        s.put("platform", "android");
        s.put("optedIn", VertalNodeCore.isOptedIn());
        s.put("running", VertalNodeCore.isRunning());
        s.put("paused", VertalNodeCore.isPaused(getContext()));
        s.put("deviceId", VertalNodeCore.deviceId(getContext()));
        return s;
    }
}
