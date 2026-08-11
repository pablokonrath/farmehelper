# ⚔️ FarmHub — Central de Farme

**Ferramenta gratuita, feita por um jogador, pra comunidade do Cabal Neo.** Sem fins lucrativos, sem assinatura, sem anúncio — e com o código fonte aberto aqui exatamente pra qualquer um poder conferir que não tem nada escondido nele.

> Ferramenta não oficial · sem vínculo com a Neo / Cabal Neo

## O que é

O FarmHub acompanha o seu farme em tempo real: lê o arquivo de log de drops que o próprio jogo gera na sua máquina, organiza tudo (o que caiu, quanto vale, quanto rendeu por hora) e avisa quando um item que você está de olho aparece — mesmo com o navegador minimizado, ou direto no Telegram.

Não existe conta compartilhada nem dado de ninguém sendo cruzado com o de outro jogador: cada conta é isolada — preços, sessões, alertas e histórico são só seus.

## Por que o código está aberto

O maior receio de quem ouve falar de uma ferramenta assim é razoável: "isso lê arquivo do meu PC, será que não é roubo de dado?". A resposta não é uma promessa, é o código em si — dá pra ler cada arquivo `.php`/`.js` deste repositório e ver exatamente o que sai da sua máquina e pra onde vai: só o conteúdo do log de drops (interpretado no seu próprio navegador) e, se você optar por usar o Telegram, o aviso de item rastreado. Nada de coleta de tela, nada de dado de conta do jogo, nada de telemetria escondida.

## Funcionalidades

- **Visão geral** — farme do dia, área de raridades, evolução por mês, filtros por data e gráficos
- **Histórico permanente** — o log do jogo guarda ~30 dias; o FarmHub arquiva o resto, então "quanto eu farmei" continua verdade em qualquer período
- **Modo guiado** — assistente passo a passo pras ações mais comuns, pra quem não quer caçar nas páginas
- **Cálculo de farme** — preço por item, itens rastreados, "onde dropa" pra achar a DG certa
- **Planejamento de Rush** — monta o rush do dia (Alz, tickets, gemas) e compara custo x retorno
- **Sessões de farme** — abre e encerra sessão sozinho conforme os drops caem ou param, contabiliza runs e Alz/hora, e destaca item raro em roxo ([como a raridade é decidida](RARIDADES.md))
- **Alertas** — som + pop-up + notificação do sistema quando um item rastreado cai, com vigilância de travamento (watchdog) caso o helper pare sozinho
- **Vendas** — histórico de preço e registro do que já foi vendido
- **Relatório** — drops agrupados por categoria, com exportação em CSV
- **Telegram** — vincula sua conta e recebe avisos (drop rastreado, travamento, horário de TG/World Boss) mesmo com o navegador fechado; comandos `/drop`, `/farm`, `/sessao` no bot

## Como funciona por baixo

- **Leitura do log ao vivo** usa a File System Access API do navegador (Chrome/Edge) — você escolhe o arquivo uma vez, e a leitura roda num Web Worker a cada 5s, mesmo em segundo plano.
- **Sem build tool.** JavaScript puro (ES modules), sem bundler, sem framework — abre e edita qualquer arquivo direto.
- Ícones ([Tabler Icons](https://tabler.io/icons)) e gráficos ([Chart.js](https://www.chartjs.org/)) via CDN; toda a arte decorativa (texturas, paisagens) é gerada em CSS/SVG puro, sem imagem externa.
- **Backend** em PHP + MySQL (pensado pra hospedagem compartilhada tipo Hostinger), autenticação por sessão, cada conta isolada por `user_id`.
- Progressive Web App — dá pra instalar como app (ícone próprio, sem barra de navegador).

## Rodando por conta própria

O passo a passo completo de deploy (banco de dados, configuração, Telegram, cron jobs) está em [DEPLOY.md](DEPLOY.md).

## Documentação

- [DEPLOY.md](DEPLOY.md) — instalação, banco de dados e migrações
- [RARIDADES.md](RARIDADES.md) — como o sistema decide o que é item raro, de onde vieram os
  limiares e por que o cadastro manual continua valendo junto com a detecção automática

## Privacidade

Pra criar conta só é preciso escolher um usuário e senha — nenhum e-mail, telefone ou dado pessoal é pedido. Os únicos dados guardados são os que você mesmo gera usando o app (preços que você cadastra, sessões de farme, itens que você rastreia) — nada disso é compartilhado com outras contas.

## Dúvidas

Abra uma [issue](../../issues) neste repositório, ou chama no WhatsApp pelo link que aparece na tela de login do site.
