// Carregado pelo service worker (importScripts em vite.config.ts). No celular, o aviso "Seu turno" é mostrado pelo
// service worker (src/ui/turnNotice.ts), e o toque nele chega aqui: volta para a aba da mesa, ou abre a mesa.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const table = tabs.find(tab => new URL(tab.url).pathname === '/') ?? tabs[0];
    if (table) return table.focus();
    return self.clients.openWindow('/');
  })());
});
