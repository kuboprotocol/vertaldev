/**
 * Vertal Vibe Dev - Affiliate Embed Script
 * Instalar em blogs/sites para rastrear cliques e conversões de afiliados
 *
 * Uso:
 * <script>
 *   window.__VERTAL_AFFILIATE = { code: "aff_abc123..." };
 * </script>
 * <script src="https://vertal.app/embed/affiliate.js" async defer></script>
 */

(function() {
  'use strict';

  const config = window.__VERTAL_AFFILIATE || {};
  const embedCode = config.code;
  const domain = config.domain || 'https://vertal.app';
  const apiBase = `${domain}/functions/v1`;

  // Validar configuração
  if (!embedCode) {
    console.warn('Vertal Affiliate: missing embed code in window.__VERTAL_AFFILIATE.code');
    return;
  }

  // Gerar session ID único para rastrear conversão
  const sessionId = 'sess_' + Math.random().toString(36).substring(2, 15);
  const storageName = `__vertal_aff_${embedCode.substring(0, 8)}`;

  // Armazenar info de referral no localStorage/sessionStorage
  try {
    sessionStorage.setItem(storageName, JSON.stringify({
      sessionId,
      embedCode,
      timestamp: Date.now(),
      referrer: document.referrer,
    }));
  } catch (e) {
    console.warn('Vertal Affiliate: unable to use sessionStorage', e);
  }

  /**
   * Registra um evento de clique/conversão
   * Chamada automaticamente em links ou manualmente via window.vertalAffiliate.track()
   */
  function trackEvent(eventType, metadata = {}) {
    if (!embedCode) return;

    const data = {
      embed_code: embedCode,
      event_type: eventType,
      user_ip: null, // Será preenchido pelo servidor
      user_agent: navigator.userAgent,
      referrer: document.referrer,
      metadata: {
        page_url: window.location.href,
        page_title: document.title,
        ...metadata,
      },
    };

    // Enviar via beacon (nenhum seguimento de resposta)
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `${apiBase}/record-affiliate-event`,
        JSON.stringify(data)
      );
    } else {
      // Fallback para fetch
      fetch(`${apiBase}/record-affiliate-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        keepalive: true,
      }).catch(e => console.warn('Vertal Affiliate: unable to track event', e));
    }
  }

  /**
   * Registra clique em link Vertal
   */
  function trackClickOnVertalLink(url) {
    trackEvent('click', {
      target_url: url,
      link_type: 'vertal_link',
    });
  }

  /**
   * Intercepta cliques em links com data-vertal-affiliate
   */
  function attachClickListeners() {
    document.addEventListener('click', function(e) {
      const target = e.target.closest('a[data-vertal-affiliate]');
      if (target && target.href) {
        trackClickOnVertalLink(target.href);
      }
    }, true);
  }

  /**
   * Trata conversão quando usuário chega à página de obrigado/sucesso
   * URL: https://vertal.app/?ref=aff_abc123... → dispara event='conversion'
   */
  function handleConversionTracking() {
    const params = new URLSearchParams(window.location.search);
    const refCode = params.get('ref') || params.get('aff_code');

    if (refCode && refCode === embedCode) {
      trackEvent('conversion', {
        conversion_type: 'signup_completed',
      });
    }
  }

  /**
   * API pública para afiliados customizados
   */
  window.vertalAffiliate = {
    track: trackEvent,
    trackClick: trackClickOnVertalLink,
    getSessionId: () => sessionId,
    getEmbedCode: () => embedCode,
  };

  // Inicializar
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      attachClickListeners();
      handleConversionTracking();
    });
  } else {
    attachClickListeners();
    handleConversionTracking();
  }

  console.log(`Vertal Affiliate initialized [${embedCode}]`);
})();
