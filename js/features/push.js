import { AppState } from '../state/app-state.js';
import { saveAlertSettings } from '../state/persistence.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';
const ONESIGNAL_SDK_URL = 'https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js';

let oneSignalReady = null;

// Carrega o SDK do OneSignal sob demanda (só quando o usuário tenta ativar o push, não em todo
// boot do app) e inicializa com o App ID vindo do servidor — não dá pra embutir direto no
// index.html porque é um arquivo estático, não passa por PHP (ver api/onesignal-config.php).
function loadOneSignal() {
  if (!oneSignalReady) {
    oneSignalReady = (async () => {
      const response = await fetch(`${API_BASE}/onesignal-config.php`, { credentials: 'same-origin' });
      const { appId } = await response.json();
      if (!appId) throw new Error('Notificação push ainda não foi configurada pelo admin do servidor.');

      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = ONESIGNAL_SDK_URL;
        script.defer = true;
        script.onload = resolve;
        script.onerror = () => reject(new Error('Falha ao carregar o SDK do OneSignal.'));
        document.head.appendChild(script);
      });

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      return new Promise(resolve => {
        window.OneSignalDeferred.push(async OneSignal => {
          await OneSignal.init({ appId });
          resolve(OneSignal);
        });
      });
    })();
  }
  return oneSignalReady;
}

export async function enablePushNotifications() {
  try {
    const OneSignal = await loadOneSignal();
    // Associa esse navegador ao próprio user_id do DropList — o servidor manda notificação
    // citando esse mesmo ID (ver cron-check-events.php), sem precisar guardar nenhum
    // player_id/subscription no nosso banco. Prefixo "droplist_" porque o OneSignal bloqueia
    // external_id genérico demais (ex: "1", "0") pra evitar colisão acidental entre apps
    // diferentes — sem o prefixo, usuários com ID baixo (tipo o primeiro cadastrado) tomavam
    // "external_id is blocked, please use a different ID" e o push nunca ativava.
    await OneSignal.login('droplist_' + AppState.currentUserId);
    await OneSignal.Notifications.requestPermission();
    // requestPermission() resolve mesmo quando o usuário nega — não lança erro nesse caso, então
    // sem checar o resultado real a gente marcava "ativado" mesmo sem permissão nenhuma concedida,
    // e a notificação nunca chegava (o toggle parecia ligado mas nunca funcionava de verdade).
    if (Notification.permission !== 'granted') {
      throw new Error('Permissão de notificação não foi concedida pelo navegador. Verifique nas configurações do site se notificações estão permitidas.');
    }
    AppState.alertSettings.pushEnabled = true;
    await saveAlertSettings();
    renderPage();
  } catch (err) {
    console.error('Falha ao ativar notificação push:', err);
    // O SDK do OneSignal às vezes rejeita a promise sem um Error de verdade (ex: undefined),
    // quando a falha vem de uma operação interna dele mesmo ("Op failed, pausing" no console) —
    // sem esse fallback, err.message quebrava com outro erro em cima do original.
    alert('Não foi possível ativar a notificação push: ' + (err?.message || 'erro desconhecido do OneSignal — veja o Console (F12) pra mais detalhes.'));
    // Sem isso, o checkbox ficava marcado na tela (o clique já mexeu no DOM) mesmo o
    // AppState/servidor nunca tendo salvo pushEnabled — re-renderiza pra refletir o estado real.
    renderPage();
  }
}

export async function disablePushNotifications() {
  try {
    const OneSignal = await loadOneSignal();
    await OneSignal.logout();
  } catch (err) {
    console.error('Falha ao desconectar do OneSignal (desativando mesmo assim):', err);
  }
  AppState.alertSettings.pushEnabled = false;
  await saveAlertSettings();
  renderPage();
}
