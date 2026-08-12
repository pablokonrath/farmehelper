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
  É o seu painel: meta do dia no topo, o filtro de período logo abaixo, e aí os totais — farme, gasto em rush e líquido.
  ${li([
    '<strong>Meta do dia + lucro/hora:</strong> defina quanto quer farmar; ele mostra o quanto já fez, o rendimento por hora e projeta quando bate a meta (comemora quando você atinge).',
    '<strong>Sua semana:</strong> farmado, vendido e nº de sessões dos últimos 7 dias comparados com os 7 anteriores — o "Farmado" ali é bruto, com o líquido logo abaixo.',
    '<strong>Raridades:</strong> área só pros itens raros — o histórico do que já veio (com DG, valor e há quanto tempo) e, embaixo, "o que você caça": as raridades cadastradas com a última vez que caíram e a taxa real (ex: 1/120 runs). Item que nunca caiu aparece como "ainda não caiu pra você".',
    '<strong>Sua evolução:</strong> compara blocos de 30 dias pela média por <strong>dia farmado</strong> — se num mês você jogou 20 dias e no outro 5, comparar o total falaria mais de presença do que de rendimento.',
    '<strong>Resumo do dia:</strong> o placar de fim de partida — farmado, gasto, líquido, vendido, runs, melhor DG e melhor drop. Dá pra <strong>copiar como imagem</strong> (um card desenhado pra isso, cola no Discord com Ctrl+V), baixar como PNG, ou copiar em texto puro pra onde imagem não serve.',
    '<strong>O que fazer agora:</strong> o card do topo mostra sempre <em>uma</em> sugestão, a mais relevante do momento — continuar o rush, montar o rush, aproveitar entrada que sobrou do limite diário, vender o que está parado, ou cadastrar preço faltando.',
    '<strong>Painel ou Completo:</strong> o botão no topo escolhe o quanto a página mostra. <strong>Painel</strong> (padrão) deixa só o essencial do dia; <strong>Completo</strong> abre raridades, evolução, consistência, gráfico, top itens e recordes. Nada é removido — muda só o que aparece primeiro, e a escolha fica salva.',
    '<strong>Filtro de data:</strong> depois de escolher um "De", dá pra <strong>fixar como padrão</strong> — o app passa a abrir sempre a partir dessa data. Limpe o campo e fixe de novo pra ver todo o histórico.',
    '<strong>Recorde pessoal:</strong> seu melhor dia e sua melhor sessão única, lá no fim da página.',
  ])}
`)}
${topic('ti-history', 'Por que o histórico não some (importante)', `
  O log do <strong>jogo</strong> guarda cerca de 30 dias e depois descarta. O FarmHub <strong>arquiva</strong> o que você farma conforme usa, então "quanto eu farmei" continua verdade em qualquer período, mesmo depois do log ter esquecido.
  ${li([
    'Dentro dos ~30 dias do log, o número vem do log (exato, inclui hoje). Antes disso, vem do arquivo do FarmHub.',
    'Se você pedir um período mais antigo do que o FarmHub começou a arquivar, a página <strong>avisa</strong> quantos dias ficaram sem dado — em vez de mostrar um total menor sem explicar.',
    'Sessões de farme ficam salvas pra sempre, sem limite: a média de Alz/run de cada DG só melhora com o tempo.',
  ])}
`)}

${sectionTitle('Farme, rush e sessões')}
${topic('ti-coins', 'Cálculo de farme (preços & itens rastreados)', `
  Aqui você diz <strong>quanto vale cada item</strong> (o preço é individual seu — cada um cadastra o seu). É isso que transforma "10 joias" em Alz na Visão geral.
  ${li([
    '<strong>Você não começa do zero.</strong> Itens que outros jogadores já precificaram aparecem com um <strong>preço de referência da comunidade</strong> — a <em>mediana</em> do que todo mundo cadastrou (mediana e não média porque um erro de digitação com um zero a mais não pode contaminar o número que todos veem). Eles já contam no seu farme normalmente. Se você discordar, é só editar: isso cria o <strong>seu</strong> preço e <strong>não muda o de mais ninguém</strong>. O ícone <i class="ti ti-users" style="color:var(--gold)"></i> marca os que ainda estão na referência.',
    'Editou e quer voltar atrás? O botão de desfazer na linha remove o seu preço e o item volta a usar o da comunidade.',
    '<strong>Só entra no catálogo compartilhado item que alguém realmente dropou</strong> (que existe no log do jogo). O nome vindo do log é canônico, então erro de digitação não polui a lista de ninguém. Você continua podendo precificar o que quiser na sua conta — item comprado, insumo de craft — só que ele fica só seu. Se digitar um nome que você nunca dropou, o app pergunta antes e sugere o nome certo, se achar parecido.',
    'KPIs no topo separam o que é seu, o que veio da comunidade, o que ninguém cadastrou ainda e o que está desatualizado (só conta os seus — preço da comunidade não é você que revisa).',
    '<strong>Tabela ordenável e com busca:</strong> clique no cabeçalho pra ordenar por nome, valor ou "Atualizado" (que já ordena do mais desatualizado pro mais recente — vira uma fila de revisão de verdade). Busca aparece a partir de 6 itens cadastrados.',
    '<strong>Coluna "Atualizado":</strong> mostra há quanto tempo cada preço não é revisto e destaca os que passaram de 2 semanas — preço velho vira estimativa errada em silêncio, e todo Alz do app depende dele. Item de preço <strong>fixo do próprio jogo</strong> (ex: Joia Enfraquecida) não entra nesse aviso — não é você quem revisa esse preço.',
    'Editando um item que você já vendeu, aparece a última venda real (valor e data) como referência — decide o novo preço com dado de verdade, não achismo.',
    '<strong>Aviso de valor implausível:</strong> se o preço digitado estiver 10× fora da sua referência (média das vendas reais ou o último preço), ele pede confirmação. Um zero a mais aqui distorce a meta do dia, o Alz/run de toda DG e o ranking de rotas ao mesmo tempo — e em silêncio.',
    '<strong>Selo de origem:</strong> <i class="ti ti-circle-check" style="color:var(--ok)"></i> quer dizer preço confirmado por uma venda sua de verdade; <i class="ti ti-pencil" style="color:var(--muted)"></i> quer dizer estimativa digitada. Serve pra saber em quais números confiar.',
    'Categoria (se cadastrada, veja o Relatório) aparece como selo ao lado do nome.',
    '<strong>Itens sem preço:</strong> lista clicável no topo pra preencher rápido, com "ver todos" se passar de 6.',
    '<strong>Itens rastreados:</strong> marque os itens que te interessam. Eles alimentam os alertas (gerencie a lista completa e ligue o sininho na página <strong>Alertas</strong>; aqui fica só o filtro de exibição — que também vale pra Visão geral e Relatório).',
    '<strong>Equipamento genérico</strong> (armadura, elmo, luva, espada, sapato...) é ignorado em todo o sistema: não tem valor de venda e só inflaria as listas.',
  ])}
`)}
${topic('ti-swords', 'Planejamento de Rush', `
  Monte um "carrinho" de DGs que vai rodar no dia e veja o <strong>custo total</strong> (o quanto vai gastar de entrada), que é descontado do lucro daquele dia.
  ${li([
    '<strong>Valores:</strong> preço do ticket e o Card Cash (1.000 Cash em Alz) — você digita uma vez e fica salvo. O custo da gema sai automático do Card Cash (÷ 1000).',
    '<strong>Reset com gema:</strong> por DG, informe se resetou o limite com gemas (quantas e o preço) — entra no custo.',
    '<strong>Créditos de macro:</strong> a parte fixa (Alz + tickets de cada faixa) já é conhecida pelo sistema; você só diz <strong>quantos vai comprar</strong>. Vincule uma vez o item variável de cada categoria e o preço passa a vir sozinho de Cálculo de farme. Ele ainda sugere a quantidade cruzando a dificuldade das DGs do carrinho com o seu tempo/run real, e avisa se passar do limite de 8/dia.',
    '<strong>Minhas rotas:</strong> molde reutilizável de DGs + repetições, sem data fixa. Aplicar <strong>soma</strong> ao carrinho de hoje (dá pra combinar mais de uma rota).',
    '<strong>Teto de rush no mês:</strong> defina um limite de investimento mensal e acompanhe o quanto já comprometeu, com aviso a partir de 80%. Não bloqueia nada — é freio pra si mesmo, porque é justamente em mês ruim que o gasto sobe tentando compensar.',
    '<strong>Histórico com planejado × realizado:</strong> cada rush salvo mostra o custo, o Alz que aquele dia de fato rendeu e o resultado. É o que valida (ou desmente) o "lucro esperado" — sem isso, a estimativa nunca é conferida. Dá pra editar, duplicar pra outro dia e excluir.',
    'Prefere passo a passo? Tem o atalho <strong>"Montar no modo guiado"</strong> no topo.',
  ])}
`)}
${topic('ti-crosshair', 'Sessões de farme (por DG)', `
  Antes de farmar numa DG, clique em <strong>Iniciar</strong> e escolha a DG — os drops que caírem entram no histórico dela. <strong>Se você esquecer, o FarmHub cuida sozinho</strong> (dá pra desligar no próprio card).
  ${li([
    '<strong>Você não precisa apertar nada.</strong> Quando os drops começam a cair sem sessão aberta, ele abre uma sozinho e <strong>retroage o início pro primeiro drop</strong>. Tenta adivinhar a DG pelos itens raros que caíram, e se errar você <strong>troca no seletor do próprio card</strong>, farmando — não precisa encerrar nem ir ao histórico.',
    '<strong>Encerrou e os drops voltaram? Ele retoma a mesma sessão.</strong> Por padrão ele fecha após 5min sem drop (ajustável), fechando <strong>no horário do último drop</strong> — o tempo parado nunca entra na conta. Se você voltar a dropar dentro de 3× esse limite <strong>e o que está caindo indicar que é a mesma DG</strong>, ele continua a sessão anterior em vez de abrir outra, então um farme longo com pausas não vira dez sessões picadas. Na dúvida ele abre uma nova: duas sessões da mesma DG é chato mas reversível, enquanto misturar duas DGs num registro só corromperia o Alz/run das duas.',
    '<strong>Retomou errado porque você trocou de DG na pausa?</strong> É só corrigir a DG no seletor — ele pergunta se o farme de antes da pausa era da DG antiga e, se for, <strong>separa em duas sessões</strong> no ponto exato da pausa.',
    '<strong>Excluiu uma sessão sem querer?</strong> Além do "Desfazer" que aparece na hora, as últimas 10 excluídas ficam guardadas numa <strong>lixeira no fim do histórico</strong> — dá pra restaurar quando quiser, ou apagar de vez. Excluir também não perde os drops: eles continuam no log e voltam a ficar disponíveis pra você registrar de novo na DG certa.',
    '<strong>Iniciou tarde?</strong> Se você entrou na DG e só lembrou de apertar "Iniciar" alguns minutos depois, ele puxa o início pro primeiro drop que ainda não pertence a nenhuma sessão — aquele farme não se perde, e ele avisa que fez isso.',
    '<strong>"Runs feitas" se conta sozinho, e você não precisa saber o tempo.</strong> O app calcula o tempo médio de run de cada DG a partir das suas próprias sessões e já sugere esse número — usando a <strong>mediana</strong>, não a média, pra uma sessão atípica (lag, pausa longa) não desregular a contagem de todas as seguintes. Se hoje a DG estiver saindo mais lenta, dá pra corrigir o "Min / run" no próprio card, farmando. Cada sessão encerrada com as runs certas melhora a sugestão da próxima.',
    '<strong>Itens caindo agora:</strong> dá pra ver o que já dropou sem encerrar a sessão. Raridade da DG sai em <strong style="color:var(--epic)">roxo</strong> e vem primeiro na lista.',
    '<strong>O que conta como raro:</strong> o que você cadastrou em Onde dropa, mais o que o seu próprio histórico mostra cair em até 2% das runs daquela DG — a mesma "taxa por run" que aparece em Onde dropa, e ajustável na Visão geral → Raridades. Vale cadastrar à mão mesmo assim: a detecção automática só enxerga item que <strong>já caiu</strong> — o que você ainda não tirou é invisível pra ela.',
    '<strong>Qual DG rende mais:</strong> ranking por <strong>Alz por run</strong> — como o número de entradas por dia é limitado, o que decide onde gastar é o rendimento por run.',
    '<strong>Aviso de DG esfriando</strong> <i class="ti ti-trending-down" style="color:var(--warn)"></i><strong>:</strong> quando as últimas sessões rendem bem menos que a média, o ícone diz a <em>causa</em> — caiu o <strong>volume</strong> (dropa menos por run, considere trocar de DG) ou piorou a <strong>composição</strong> (dropa o mesmo tanto, só que de coisa mais barata, e trocar pode não resolver). Passe o mouse pra ver.',
    '<strong>Anotação por sessão:</strong> um campo livre em cada linha do histórico ("lag", "testei build", "evento 2×"). Sessão fora do padrão distorce a média daquela DG pra sempre — anotar preserva o farme real em vez de exigir que você exclua a sessão.',
    '<strong>No celular</strong>, as tabelas grandes viram cartões (um por linha), em vez de rolar pro lado.',
    '<strong>Quanto tempo você tem hoje:</strong> diga quantas horas tem e ele monta a combinação de rota salva + DGs avulsas que mais rende nesse tempo.',
    '<strong>Seu horário mais produtivo:</strong> junta todas as suas sessões pela hora em que começaram e mostra em que faixa do dia você historicamente rende mais (só entra faixa com 2+ sessões, pra um dia de sorte não virar regra).',
    '<strong>Tempo ativo:</strong> a duração desconta a inatividade (se o rush parou e você demorou a encerrar, esse tempo parado não infla a sessão).',
    '<strong>Vale a pena resetar?:</strong> informando o valor da gema, ele diz se compensa resetar a DG pra fazer runs extras — e avisa no próprio carrinho, antes de você gastar.',
    '<strong>Progresso do rush de hoje:</strong> cruza o rush que você montou com as runs de fato feitas, e mostra o Alz esperado vs. o já realizado. As DGs que ainda faltam aparecem no topo do seletor de DG.',
    '<strong>Vigilância automática:</strong> ao iniciar a sessão, o watchdog (aviso de travamento) liga sozinho; ao encerrar, desliga.',
  ])}
`)}
${topic('ti-compass', 'Onde dropa', `
  Descobre onde farmar, nos dois sentidos: qual DG dropa um item, e o que uma DG dropa.
  ${li([
    '<strong>Busca por item:</strong> digite o nome (completo ou parte) e veja em quais DGs ele já caiu no seu histórico de sessões, ordenado pela taxa por run — com a faixa provável (não só um número seco) e aviso quando a amostra ainda é pequena.',
    'Ainda não farmou aquela DG? Se o cadastro curado (Itens × DGs, do admin) já sabe que o item cai lá, aparece como "também já é sabido que cai em", mesmo sem taxa sua ainda.',
    '<strong>Busca reversa — "O que uma DG dropa":</strong> escolha uma DG e veja tudo que ela já deu, ordenado pelo que rende mais Alz esperado por run (taxa × preço cadastrado). Com uma sessão ativa, já abre nela sozinha.',
    'Diga "quero calcular pra quantas unidades" e ele estima quantos runs faltam, com faixa otimista/pessimista.',
    '<strong>Qual rota rende mais deste item:</strong> ranking das suas rotas salvas pra esse item.',
    '<strong>Comparar duas DGs:</strong> escolha duas e veja Alz/run, líquido, Alz/hora, tempo por run e custo de entrada lado a lado, com seta marcando quem ganha em cada linha — pra decidir "entre essas duas, qual eu rodo agora", que é como a escolha acontece de verdade.',
    '<strong>Minhas metas de item:</strong> as outras metas do app são em Alz; esta é em <strong>item</strong> ("preciso de 300 Núcleos pro +15"). Ele mostra o progresso, <strong>quantos runs faltam</strong>, <strong>em qual DG sai mais rápido</strong> e uma <strong>data estimada</strong> pelo seu ritmo real dos últimos 14 dias. Conta o que caiu a partir do dia em que você criou a meta — o app não conhece seu inventário, então esse é o único recorte honesto.',
    'Achou a DG certa? <strong>"Ir farmar aqui"</strong> leva pra Sessões de farme com ela já selecionada. Achou a rota certa? <strong>"Aplicar"</strong> soma ela ao carrinho de hoje e leva pro Planejamento de Rush.',
  ])}
`)}
${topic('ti-notebook', 'Relatório', `
  Seus drops agrupados por categoria, com exportação em CSV.
  ${li([
    '<strong>Duas camadas de categoria.</strong> As <strong>globais</strong> são um cadastro do admin mestre (ex: "Núcleos", "Joias"), iguais pra todo mundo. As <strong>suas</strong> (card "Minhas categorias") são só suas e valem <strong>por cima</strong> da global no mesmo item — pra separar coisas do seu jeito ("insumos de craft", "guardar pro set") sem depender de ninguém. "Seguir a global" volta ao padrão.',
    '<strong>Atribuição em massa:</strong> categoriza de uma vez todo item que contém uma palavra (ex: "Nucleo" → categoria "Núcleos"), em vez de escolher item por item. Vale nas duas camadas.',
    '<strong>Mês atual vs. mês passado, por categoria:</strong> compara o mês civil corrente com o anterior, categoria a categoria — sempre olha tudo, sem filtro de data por cima.',
    '<strong>Exportar CSV</strong> de todos os drops do período filtrado, pra planilha ou backup.',
  ])}
`)}

${sectionTitle('Mercado')}
${topic('ti-cash', 'Vendas', `
  Registre suas vendas reais (item, quantidade, valor) e compare com o preço estimado.
  ${li([
    '<strong>Total vendido</strong> (real), <strong>real vs. estimado</strong> e <strong>ticket médio</strong> — com um filtro De/Até próprio da página (Cofres e Histórico de preço ignoram esse filtro de propósito, são sobre acumulado/tendência).',
    '<strong>Erros de digitação:</strong> falta preencher algo? Ele avisa em vez de simplesmente não fazer nada. Vai registrar uma venda idêntica a uma já lançada no mesmo dia? Ele confere antes — pega o clássico "cliquei duas vezes sem perceber". E se o valor por unidade sair 10× fora da sua referência, ele confirma antes de gravar (a venda também vira o preço cadastrado do item).',
    '<strong>Referência antes de digitar:</strong> ao escolher o item, aparece a média das suas últimas vendas dele — você decide o preço já ancorado no seu próprio histórico, não no chute.',
    '<strong>Editar venda:</strong> clique no lápis da linha pra corrigir item, quantidade, valor ou data — sem precisar excluir e digitar tudo de novo. "Repetir última venda" preenche o formulário com o último item vendido, útil quando você vende o mesmo item várias vezes seguidas.',
    '<strong>Possível estoque não vendido:</strong> cruza tudo que você já dropou com tudo que já vendeu e aponta o que caiu bastante e vendeu pouco — é radar, não auditoria. Mostra também <strong>há quantos dias</strong> o item não cai, pra separar o que você segura de propósito do que só esqueceu. Dê baixa (vendido sem registrar / virou coleção / usado em craft) pra parar de aparecer; se cair mais desse item depois, só o excedente novo volta a sinalizar. Dá pra desfazer a baixa a qualquer momento.',
    '<strong>Aviso de venda barata:</strong> se você registrar uma venda 20% abaixo da sua média recente daquele item, ele pergunta antes de gravar — evita que uma venda apressada distorça seu histórico de preço.',
    '<strong>Real vs. estimado por item:</strong> quebra o total geral item a item, pra achar rápido qual está vendendo abaixo do esperado — com aviso quando o problema pode ser o preço cadastrado desatualizado, não a venda em si.',
    '<strong>Histórico de preço</strong> e <strong>Vendas ao longo do tempo:</strong> o primeiro é a variação do preço pelo qual você <strong>realmente vendeu</strong> cada item; o segundo é o total realizado por dia (ritmo de venda, não preço).',
    '<strong>Exportar CSV</strong> das vendas do período filtrado.',
    '<strong>Cofres de Alz:</strong> reserve uma % fixa de cada venda pra um objetivo (ex: 30% de tudo que vender vai pro set novo). Vale só pras vendas registradas depois que o cofre foi criado, e agora mostra o ritmo (Alz/dia) e uma data estimada de conclusão. Não confunda com a "Meta de farme" do dia — uma é o que você farma, o cofre é o que você vende de fato.',
  ])}
`)}
${sectionTitle('Alertas e avisos')}
${topic('ti-bell', 'Alertas de itens', `
  Configure som, pop-up e notificação do sistema pros itens que você rastreia. Quando o item cai no seu farme, você é avisado na hora.
  ${li([
    'Uma faixa no topo da página mostra o status geral (alertas, watchdog, Telegram, quantos avisos não vistos) sem precisar abrir nenhum card.',
    '<strong>Palavras rastreadas:</strong> gerencie tudo aqui — adicionar, remover, ligar/desligar o sininho de cada uma. Cada palavra mostra quantos itens já dropados batem com ela (0 é sinal de erro de digitação, ou item que ainda não caiu).',
    '<strong>Sugestão automática:</strong> itens valiosos que você já dropou e ainda não rastreia aparecem com um botão de 1 clique, já com o alerta ligado.',
    'Tem controle de volume, tempo do pop-up e agrupamento (pra não spammar quando cai vários juntos).',
    'Dá pra subir um som personalizado pra cada tipo de alerta.',
    'Histórico de alertas guarda os últimos 50 (ou tudo dentro das últimas 4h, o que for mais) — poda sozinho, sem precisar limpar na mão.',
  ])}
`)}
${topic('ti-shield-bolt', 'Vigilância de inatividade (watchdog)', `
  Avisa quando o helper <strong>trava</strong> (para de dropar) ou quando um item rastreado some por muito tempo. Card colapsado por padrão — o resumo já mostra se tá vigiando ou não sem precisar abrir.
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

${sectionTitle('Como o app se comporta')}
${topic('ti-arrow-back-up', 'Desfazer, e quando ele pergunta antes', `
  Excluir uma venda, uma sessão, uma rota, um cofre, uma meta ou limpar o carrinho <strong>acontece na hora</strong> — e aparece um aviso com <strong>Desfazer</strong> por alguns segundos.
  ${li([
    'É de propósito: perguntar "tem certeza?" cobra pedágio de quem já sabia o que estava fazendo, e ainda por cima pergunta <em>antes</em> de você ver o resultado. Desfazer deixa ver e voltar atrás.',
    'Onde ele <strong>ainda pergunta antes</strong> é onde não existe volta: apagar coisa global que vale pra todo mundo (categoria do admin, cadastro Itens × DGs, catálogo de DGs) e restaurar listas padrão.',
    'As confirmações de <strong>preço/venda</strong> são outra coisa: não são "tem certeza que quer apagar", são conferência de valor (venda duplicada, preço fora de ordem de grandeza, venda abaixo da média).',
  ])}
`)}

${sectionTitle('Extras')}
${topic('ti-bolt', 'Modo guiado', `
  Um assistente passo a passo pras coisas mais comuns, com botões grandes — bom pra quem tá com pressa ou não quer caçar nas páginas. Ele pergunta "o que você quer fazer?" e te leva:
  ${li([
    'Registrar uma venda · Definir a meta do dia · Iniciar/encerrar sessão de DG',
    'Rastrear item p/ alerta · Montar o rush de hoje',
    'Aplicar uma rota salva · Criar um cofre de Alz · Recuperar sessão esquecida',
    '<strong>Ele é só isso, de propósito:</strong> atalho pras ações do dia a dia. Corrigir um registro, filtrar por período, comparar DGs, dar baixa em estoque e as análises ficam nas páginas completas — não são "coisas que faltam aqui", são coisas que moram lá.',
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
<div style="margin-top:10px;text-align:center;font-size:var(--fs-2xs);color:var(--muted)">Emblemas de fundo: ícones de <a href="https://game-icons.net" target="_blank" rel="noopener" style="color:var(--muted)">game-icons.net</a> sob licença <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener" style="color:var(--muted)">CC BY 3.0</a>.</div>`;
}
