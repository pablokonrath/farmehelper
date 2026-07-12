// Handler de fetch mínimo: NÃO faz cache (o app depende do backend e é inútil offline). A simples
// PRESENÇA de um fetch handler é o que faz o Chrome/Android instalarem o app de verdade (janela
// própria / WebAPK) em vez de um atalho que abre dentro do navegador. Fica ANTES do import pra
// continuar valendo mesmo se um ad blocker bloquear o CDN do OneSignal.
self.addEventListener('fetch', () => {});

// Worker do OneSignal (push). Envolvido em try/catch pra, se o CDN cair/for bloqueado, o worker
// ainda instalar com o fetch handler acima (o app continua instalável; só o push que não sobe).
try {
  importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDKWorker.js');
} catch (e) {}
