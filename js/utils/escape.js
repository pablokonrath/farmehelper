// Escape de HTML — proteção contra XSS armazenado. Todo dado controlado pelo usuário (nick, nome
// de item vindo do log, guild, palavra do ranking, etc.) é montado em template string e jogado no
// innerHTML, então PRECISA passar por aqui antes de ir pra tela — senão um nome tipo
// `<img src=x onerror=...>` executa no navegador de quem abrir (inclusive o do admin mestre).

// Para conteúdo/atributo HTML normal: >texto<, title="...", value="...".
export function esc(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// Para valor dentro de handler inline: onclick="fn('${escAttr(v)}')". Primeiro escapa aspas/barra
// pro contexto de string JS, depois escapa HTML — assim o valor não quebra nem a string JS nem o
// atributo, mesmo com aspas ou `<`/`>` no meio.
export function escAttr(v) {
  return esc(String(v ?? '').replaceAll('\\', '\\\\').replaceAll("'", "\\'"));
}
