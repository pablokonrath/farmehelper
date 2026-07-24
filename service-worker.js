// Handler de fetch mínimo: NÃO faz cache (o app depende do backend e é inútil offline). A simples
// PRESENÇA de um fetch handler é o que faz o Chrome/Android instalarem o app de verdade (janela
// própria / WebAPK) em vez de um atalho que abre dentro do navegador.
self.addEventListener('fetch', () => {});
