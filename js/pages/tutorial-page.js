// Seção expansível (nativa, via <details> — sem estado nem handler). `open` deixa a primeira
// aberta pra mostrar o padrão de uso.
function topic(icon, title, bodyHtml, open = false) {
  return `<details${open ? ' open' : ''} style="background:var(--surf2);border:1px solid var(--border);border-radius:12px;margin-bottom:10px">
  <summary style="cursor:pointer;padding:14px 16px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:10px;user-select:none">
    <i class="ti ${icon}" style="color:var(--acc)"></i>${title}
  </summary>
  <div style="padding:2px 16px 16px;font-size:13px;color:var(--txt2);line-height:1.65">${bodyHtml}</div>
</details>`;
}

function sectionTitle(text) {
  return `<div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--gold);margin:22px 0 10px">${text}</div>`;
}

const li = items => `<ul style="margin:6px 0 0;padding-left:18px">${items.map(i => `<li style="margin-bottom:5px">${i}</li>`).join('')}</ul>`;

export function renderTutorialPage() {
  return `
<div class="pg-title"><i class="ti ti-book-2" style="color:var(--acc)"></i>Tutorial</div>
<div class="pg-sub">Como cada parte do sistema funciona. Clique num tópico pra abrir. A ideia é acompanhar seu farme, calcular custos e não perder nenhum item raro.</div>

<div class="card">
  <div style="font-size:13px;color:var(--txt2);line-height:1.65">
    <strong style="color:var(--acc)">Em 1 minuto:</strong> conecte seu arquivo de log do jogo (menu lateral), cadastre o preço dos seus itens em <strong>Cálculo de farme</strong>, e pronto — a <strong>Visão geral</strong> já mostra quanto você fez no dia. O resto (rush, alertas, vendas) é pra ir usando conforme a necessidade. Se travar, tem o <strong>⚡ Modo guiado</strong> que te leva passo a passo.
  </div>
</div>

${sectionTitle('Começando')}
${topic('ti-plug', 'Conectar o arquivo de log (o mais importante)', `
  Tudo parte do arquivo de <strong>log de drops do jogo</strong>. No menu lateral, use <strong>"Conectar ao vivo"</strong> (funciona no Chrome/Edge no PC) e aponte pro arquivo de log do Cabal Neo.
  ${li([
    'Ao vivo = o sistema lê o arquivo sozinho a cada 5s e vai atualizando os drops, alertas e contadores na hora — mesmo com o navegador minimizado.',
    'Precisa do navegador aberto (pode estar minimizado). Fechou o navegador, para de ler.',
    'Não sabe onde fica o arquivo? Geralmente na pasta de Log do jogo, um arquivo chamado <strong>DropList</strong> (sem extensão).',
    'Sem tempo real dá pra <strong>subir o arquivo manualmente</strong> só pra dar uma olhada — mas aí não atualiza sozinho.',
  ])}
`, true)}
${topic('ti-layout-dashboard', 'Visão geral', `
  É o seu painel do dia: total de Alz do farme, quantidade de drops, gráfico por horário, e os itens que mais renderam.
  ${li([
    '<strong>Meta do dia + lucro/hora:</strong> defina quanto quer farmar; ele mostra o quanto já fez, o rendimento por hora e projeta quando bate a meta (comemora quando você atinge).',
    '<strong>Comparar dias:</strong> escolha dois dias pra ver lado a lado, com a diferença item a item.',
    'Dá pra adicionar drops manuais também, pra itens que não vieram do log.',
  ])}
`)}

${sectionTitle('Farme, rush e sessões')}
${topic('ti-coins', 'Cálculo de farme (preços & itens rastreados)', `
  Aqui você diz <strong>quanto vale cada item</strong> (o preço é individual seu — cada um cadastra o seu). É isso que transforma "10 joias" em Alz na Visão geral.
  ${li([
    '<strong>Itens rastreados:</strong> marque os itens que te interessam. Eles alimentam os alertas (o sininho liga o alerta sonoro/pop-up daquele item).',
    'Dá pra filtrar a Visão geral só pelos itens rastreados, se quiser focar no que importa.',
  ])}
`)}
${topic('ti-swords', 'DGs de rush diário', `
  Monte um "carrinho" de DGs que vai rodar no dia e veja o <strong>custo total</strong> (o quanto vai gastar de entrada), que é descontado do lucro daquele dia.
  ${li([
    '<strong>Valores:</strong> preço do ticket e o Card Cash (1.000 Cash em Alz) — você digita uma vez e fica salvo. O custo da gema sai automático do Card Cash (÷ 1000).',
    '<strong>Reset com gema:</strong> por DG, informe se resetou o limite com gemas (quantas e o preço) — entra no custo.',
    '<strong>Créditos de macro:</strong> se comprou créditos pra rodar o helper, informe por categoria (preço de mercado + custo de fabricar).',
    '<strong>Histórico:</strong> cada dia fica salvo. Dá pra editar, duplicar pra outro dia e excluir.',
    'Prefere passo a passo? Tem o atalho <strong>"Montar no modo guiado"</strong> no topo.',
  ])}
`)}
${topic('ti-crosshair', 'Sessões de farme (por DG)', `
  Opcional, mas poderoso: antes de começar a farmar numa DG, clique em <strong>Iniciar</strong> e escolha a DG. Os drops que caírem entram no histórico daquela dungeon.
  ${li([
    '<strong>Qual DG rende mais:</strong> ranking por <strong>Alz por run</strong> — como o número de entradas por dia é limitado, o que decide onde gastar é o rendimento por run.',
    '<strong>Tempo ativo:</strong> a duração desconta a inatividade (se o rush parou e você demorou a encerrar, esse tempo parado não infla a sessão).',
    '<strong>Vale a pena resetar?:</strong> informando o valor da gema, ele diz se compensa resetar a DG pra fazer runs extras.',
    '<strong>Progresso do rush de hoje:</strong> cruza o rush que você montou com as sessões feitas e marca ✅/⬜ automaticamente, pra ver quais DGs ainda faltam.',
    '<strong>Vigilância automática:</strong> ao iniciar a sessão, o watchdog (aviso de travamento) liga sozinho; ao encerrar, desliga.',
  ])}
`)}

${sectionTitle('Mercado')}
${topic('ti-cash', 'Vendas', `
  Registre suas vendas reais (item, quantidade, valor) e compare com o preço estimado.
  ${li([
    '<strong>Total vendido</strong> (real) vs. o estimado pelo preço cadastrado, e a diferença.',
    '<strong>Histórico de preço:</strong> cada vez que você muda o preço de um item, vira um ponto no gráfico, pra ver a variação.',
  ])}
`)}
${sectionTitle('Alertas e avisos')}
${topic('ti-bell', 'Alertas de itens', `
  Configure som, pop-up e notificação do sistema pros itens que você rastreia (em Cálculo de farme, no sininho). Quando o item cai no seu farme, você é avisado na hora.
  ${li([
    'Tem controle de volume, tempo do pop-up e agrupamento (pra não spammar quando cai vários juntos).',
    'Dá pra subir um som personalizado pra cada tipo de alerta.',
  ])}
`)}
${topic('ti-shield-bolt', 'Vigilância de inatividade (watchdog)', `
  Avisa quando o helper <strong>trava</strong> (para de dropar) ou quando um item rastreado some por muito tempo.
  ${li([
    '<strong>Liga e desliga sozinho</strong> junto com a sessão de DG — você não precisa lembrar de ativar.',
    'Você define os limites em minutos (sem nenhum drop / sem dropar um item específico).',
    'Pode receber o aviso de travamento também no Telegram.',
  ])}
`)}
${topic('ti-send', 'Fora do app: Telegram', `
  Pra receber avisos com o navegador <strong>fechado</strong>:
  ${li([
    '<strong>Vincule sua conta:</strong> gera um código, você manda pro bot. Aí recebe avisos de TG/World Boss, drop rastreado e watchdog (helper travado ou conexão ao vivo perdida).',
    'Mande <strong>/drop</strong> pro bot pra ver o que você já dropou hoje, ou <strong>/farm</strong> pro resumo em Alz. <strong>/sessao</strong> mostra a sessão de DG ativa.',
    'Importante: alertas do SEU próprio drop e o watchdog (incluindo o aviso de reconexão) dependem do navegador aberto (é ele que detecta) — só chegam no Telegram enquanto ele estiver aberto (mesmo minimizado). TG/World Boss chegam mesmo com o navegador fechado.',
  ])}
`)}

${sectionTitle('Extras')}
${topic('ti-bolt', 'Modo guiado', `
  Um assistente passo a passo pras coisas mais comuns, com botões grandes — bom pra quem tá com pressa ou não quer caçar nas páginas. Ele pergunta "o que você quer fazer?" e te leva:
  ${li([
    'Registrar uma venda · Definir a meta do dia · Iniciar/encerrar sessão de DG',
    'Rastrear item p/ alerta · Montar o rush de hoje',
  ])}
`)}
${topic('ti-device-mobile', 'Instalar no celular (app)', `
  O sistema funciona como app no celular (PWA):
  ${li([
    '<strong>Android (Chrome):</strong> abra o site, menu ⋮ → "Instalar app".',
    '<strong>iPhone (Safari):</strong> botão Compartilhar → "Adicionar à Tela de Início".',
    'Depois de instalar, faça login com a mesma conta. Tudo que fica na sua conta (preços, metas, sessões, vendas) aparece no celular. A Visão geral em tempo real continua sendo do PC (é lá que o log é lido).',
  ])}
`)}

<div class="card" style="margin-top:16px;text-align:center">
  <div style="font-size:13px;color:var(--muted)">Ficou com dúvida em algo que não está aqui? Fala com o <strong style="color:var(--gold)">AnnIKILADOR</strong> no jogo. 🎮</div>
</div>
<div style="margin-top:10px;text-align:center;font-size:10px;color:var(--muted)">Emblemas de fundo: ícones de <a href="https://game-icons.net" target="_blank" rel="noopener" style="color:var(--muted)">game-icons.net</a> sob licença <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener" style="color:var(--muted)">CC BY 3.0</a>.</div>`;
}
