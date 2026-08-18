# Deploy do FarmHub na Hostinger

Passo a passo pra colocar o backend PHP/MySQL no ar. Tudo aqui é feito pelo hPanel da
Hostinger (painel de controle da hospedagem) — nenhum acesso SSH é necessário.

## 0. Deploy automático via GitHub (opcional, recomendado)

O projeto já é um repositório git local. Pra editar aqui e a Hostinger puxar sozinha a cada
push, sem precisar subir arquivo por FTP/Gerenciador de Arquivos toda vez:

1. **Crie o repositório no GitHub** (github.com → New repository → privado). Não crie
   README/gitignore por lá, o projeto já tem os arquivos.
2. No seu terminal, dentro da pasta do projeto, rode (troque a URL pela do seu repo):
   ```
   git remote add origin https://github.com/pablokonrath/SEU-REPO.git
   git branch -M main
   git push -u origin main
   ```
   O Git deve pedir login do GitHub na primeira vez (via navegador ou token) — segue o fluxo
   que aparecer.
3. No hPanel, vá em **Avançado → Git**, cole a URL do repositório, escolha a branch `main` e
   a pasta de destino (a raiz pública do domínio/subdomínio onde o FarmHub vai ficar).
   Pra repositório **privado** a Hostinger vai pedir autenticação — ela geralmente mostra uma
   chave SSH pública própria que você precisa adicionar em GitHub → Settings → Deploy Keys
   do repositório (com permissão só de leitura já basta).
4. **`api/config.php` nunca vem pelo git** (está no `.gitignore` de propósito, só o
   `api/config.example.php` fica versionado). Depois do primeiro deploy pela Hostinger, entre
   no Gerenciador de Arquivos, copie `api/config.example.php` pra `api/config.php` e preencha
   com os dados reais (passos 3 e 4 abaixo) — só precisa fazer isso uma vez.
5. **Importante conferir**: depois de fazer um segundo push de teste e deixar a Hostinger
   puxar de novo, confirme que `api/config.php` continua no ar (não foi apagado). A maioria
   dos deploys via git faz só um `pull` (não mexe em arquivo que não está no repositório), mas
   se o painel da Hostinger fizer uma "limpeza"/clone do zero a cada deploy, `config.php`
   seria apagado toda vez — nesse caso me avisa que a gente ajusta a estratégia (ex: guardar
   as credenciais fora da pasta que a Hostinger sobrescreve).

Com isso configurado, o fluxo normal passa a ser: eu edito os arquivos aqui → você (ou eu, se
pedir) roda `git add`, `git commit`, `git push` → a Hostinger atualiza sozinha (automaticamente
ou com um clique de "Deploy" no hPanel, dependendo de como o painel dela funciona).

## 1. Criar o banco de dados

1. No hPanel, vá em **Bancos de Dados → Bancos de Dados MySQL**.
2. Crie um banco novo (anote o nome) e um usuário com senha (anote usuário e senha) — a
   Hostinger geralmente prefixa o nome do banco/usuário com algo como `u123456789_`.
3. Abra o **phpMyAdmin** (tem um atalho na mesma tela), selecione o banco criado, vá na aba
   **SQL** e cole o conteúdo do arquivo `sql/schema.sql` deste projeto (só pra instalação
   **nova, do zero** — se seu banco já tem dados de uma versão anterior sem login
   multiusuário, veja a seção **"Migrando de usuário único pra multiusuário"** mais abaixo
   em vez de rodar o schema.sql). Execute.
4. Confirme que 9 tabelas apareceram: `users`, `item_prices`, `rush_history`,
   `tracked_keywords`, `app_settings`, `dungeons`, `manual_drops`, `alert_settings`,
   `alert_history`.

## 2. Subir os arquivos

1. No hPanel, abra o **Gerenciador de Arquivos** (ou use FTP) e vá até a pasta pública do
   seu domínio (geralmente `public_html`).
2. Envie **todo o conteúdo** deste projeto pra lá: `index.html`, `sobre.html` (a página de
   apresentação linkada da tela de login), as pastas `css/`, `js/`, `api/` — mas **não** envie
   a pasta `sql/` (não precisa ficar público) nem `.claude/`.

## 3. Configurar o banco no `api/config.php`

Edite `api/config.php` diretamente no Gerenciador de Arquivos (ou edite antes de subir) e
preencha com os dados reais do passo 1:

```php
define('DB_HOST', 'localhost');
define('DB_NAME', 'u123456789_droplist');   // nome real do seu banco
define('DB_USER', 'u123456789_droplist');   // usuário real
define('DB_PASS', 'sua-senha-aqui');
```

`DB_HOST` quase sempre é `localhost` na Hostinger — só mude se o painel indicar outro host.

## 4. Criar sua conta de login

Login não usa mais uma senha única — cada pessoa tem sua própria conta (usuário + senha) na
tabela `users`. `api/generate-password-hash.php` não faz parte do deploy automático via git
(está fora do repositório, veja `.gitignore`) — precisa subir ele manualmente só quando for
gerar/trocar uma senha.

1. Suba `api/generate-password-hash.php` pro servidor manualmente (Gerenciador de Arquivos),
   dentro da pasta `api/`.
2. Pelo navegador, acesse `https://seudominio.com/api/generate-password-hash.php`.
3. Digite a senha que você quer usar e clique em **Gerar hash**. Copie o texto gerado
   (começa com `$2y$...`).
4. No phpMyAdmin, aba **SQL**, rode (trocando `seu_usuario` e o hash colado):
   ```sql
   INSERT INTO users (username, password_hash) VALUES ('seu_usuario', '$2y$10$....(cole aqui)....');
   ```
5. **Apague o arquivo `api/generate-password-hash.php` do servidor** — ele não deve ficar
   no ar (e como não está no git, não volta sozinho no próximo deploy). Reenvie ele só
   quando precisar gerar outro hash (ex: pra criar a conta de mais alguém).

## 5. Testar

1. Acesse `https://seudominio.com` — deve aparecer a **tela de login**, não o painel direto.
2. Digite o usuário e a senha criados no passo 4. Deve entrar no app.
   - Se aparecer "Usuário ou senha incorretos": confira se o `INSERT` no passo 4 rodou sem
     erro (veja no phpMyAdmin, tabela `users`, se a linha existe) e se colou o hash certo.
3. **Se esse navegador já tinha dados salvos** (preços, rush, DGs) de quando o FarmHub
   ainda usava só localStorage: no primeiro login, o app deve migrar tudo automaticamente
   pro banco, associado à conta que você acabou de logar (isso acontece sozinho, sem
   precisar apertar nada). Confira no phpMyAdmin se as tabelas `item_prices`/`rush_history`/
   etc. ficaram com os dados esperados.
4. Adicione um preço de item ou salve um rush, dê F5 na página — o dado deve continuar lá
   (agora vindo do banco, não mais do localStorage do navegador).
5. Teste o botão **Sair** (logout) no rodapé da barra lateral, e confirme que usuário/senha
   errados são rejeitados.

## Criando conta pra outra pessoa

Se sua conta é admin (veja a seção **"Admin: conta administradora e ranking"** abaixo), é só
usar a tela **Admin** dentro do próprio FarmHub — sem precisar mexer no phpMyAdmin. Se ainda
não rodou aquela migração, o jeito manual continua funcionando: repete o passo 4 (gerar hash
pra senha da pessoa, apagar `generate-password-hash.php` depois) com um `username` diferente.

Cada conta é totalmente isolada pra farme/rush/alertas — só os preços de item e a lista de
DGs são compartilhados entre todo mundo.

## Admin: conta administradora e ranking

Duas coisas novas: (1) marcar sua conta como admin, o que libera uma tela **Admin** pra criar
contas direto pelo site em vez de phpMyAdmin; (2) um **Ranking** que mostra, pra cada item de
uma lista **global** controlada só pelo admin (não a lista pessoal de "palavras rastreadas"
de cada um, que continua só pros alertas de cada pessoa), quem da guild dropou mais — só a
quantidade aparece, não o valor em Alz.

Se seu banco já tem a tabela `users` (ou seja, você já rodou a migração multiusuário):

1. No phpMyAdmin, aba **SQL**, cole o conteúdo de `sql/migrate_admin_and_leaderboard.sql`,
   trocando `pablokonrath` (na linha do `UPDATE`) pelo username que você usa pra logar, caso
   tenha escolhido outro. Execute.
2. Recarregue o FarmHub e loga de novo — deve aparecer um item **Admin** novo na barra
   lateral, só na sua conta.
3. Pra criar conta de outra pessoa, usa essa tela em vez do phpMyAdmin daqui pra frente.
4. Na tela **Admin**, card **"Itens do ranking"**, cadastre os itens que devem entrar no
   ranking (ex: "Extensor Altíssimo") — essa lista é global, só admin edita.
5. O ranking (item **Ranking** na barra lateral) começa vazio pra cada item cadastrado — ele
   se preenche sozinho conforme o arquivo de log de cada pessoa for lido/atualizado
   (sincroniza a contagem automaticamente, sem precisar fazer nada manual em cada conta).

Se você está instalando o FarmHub do zero (nunca rodou nenhuma migração antes), não precisa
desse script — `sql/schema.sql` já cria tudo pronto. Só lembre de rodar
`UPDATE users SET is_admin = 1 WHERE username = 'seu_usuario';` depois de criar sua conta no
passo 4 lá em cima, se quiser que ela seja admin.

## Destaque no ranking + categorias de item no Relatório

Se seu banco já rodou `sql/migrate_admin_and_leaderboard.sql`, rode agora
`sql/migrate_ranking_featured_and_categories.sql` no phpMyAdmin (aba SQL) — adiciona:

- **Destaque no Ranking**: na tela Admin, cada item do ranking ganha uma estrela pra marcar
  como destaque — fica fixado no topo da página Ranking com um brilho dourado, mesmo que
  você filtre por outro item.
- **Filtro no Ranking**: um seletor no topo da página Ranking pra ver só um item específico.
- **Categorias de item**: dois cards novos na tela Admin — "Categorias de item" (cria nomes
  livres tipo Sets/Armas/Dragonas) e "Atribuir categorias" (escolhe a categoria de cada item
  com preço cadastrado). O Relatório passa a agrupar por categoria em vez de por dia, com a
  data aparecendo em cada linha.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Guilds + múltiplos admins/líderes

Se seu banco já rodou `sql/migrate_ranking_featured_and_categories.sql`, rode agora
`sql/migrate_guilds.sql` no phpMyAdmin (aba SQL) — adiciona:

- **Guilds**: novo card na tela Admin pra cadastrar nomes de guild (lista controlada, evita
  duplicidade tipo "Guild XYZ" vs "guild xyz").
- **Criar conta** ganha um seletor de guild e um checkbox "Admin/Líder" — agora dá pra criar
  contas já marcadas como admin, não só a sua.
- **Contas existentes**: o "Tipo" (Admin/Padrão) virou um botão — clique pra promover ou
  rebaixar uma conta já existente, sem precisar recriar. A guild de cada conta também fica
  editável ali.

O Ranking em si não muda nesta rodada — continua por jogador. Um filtro "por guild" fica pra
uma próxima atualização.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Ranking por período (Geral/Semanal/Quinzenal/Mensal) + guild no ranking

Se seu banco já rodou `sql/migrate_guilds.sql`, rode agora `sql/migrate_ranking_periods.sql`
no phpMyAdmin (aba SQL) — cria a tabela `drop_counts_daily`, igual `drop_counts` só que com
uma linha por dia em vez de um total acumulado. Isso alimenta as novas abas do Ranking:

- **Abas Geral/Semanal/Quinzenal/Mensal**: o jogador escolhe o recorte (últimos 7/15/30 dias,
  ou o total desde sempre). A aba Geral continua lendo de `drop_counts`, sem mudança nenhuma;
  as outras três somam `drop_counts_daily` dos últimos N dias.
- **Nome da guild no ranking**: aparece abaixo do nome de usuário (no pódio e na tabela), com
  o nome do jogador sempre em destaque.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Alertas de integridade + log de atividade do admin

Se seu banco já rodou `sql/migrate_ranking_periods.sql`, rode agora
`sql/migrate_integrity_and_admin_log.sql` no phpMyAdmin (aba SQL) — cria as tabelas
`integrity_flags` e `admin_action_log`. Duas coisas novas na página Admin:

- **Alertas de integridade**: sinalizações heurísticas de possível dado forjado — o polling
  detecta se o trecho já lido do arquivo de log mudou entre duas leituras (indício de edição
  manual) e o servidor sinaliza sincronizações que aumentam a contagem de um item muito acima
  do normal pra um poll de 5s. Não bloqueia nada, é só um ponto de atenção pro admin revisar
  manualmente — falso positivo é esperado (ex: alguém que ficou dias sem sincronizar).
- **Log de atividade**: registra o que cada admin criou/alterou (contas, guilds, itens do
  ranking, categorias, atribuições), com quem fez e quando.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Admin mestre

Se seu banco já rodou `sql/migrate_integrity_and_admin_log.sql`, rode agora
`sql/migrate_master_admin.sql` no phpMyAdmin (aba SQL) — adiciona a coluna `is_master_admin`
em `users` e já marca a conta `pablokonrath` como mestre (se quiser outro usuário como mestre,
edite o `UPDATE` do script antes de rodar). O admin mestre é um nível acima dos demais
admins/líderes:

- **Excluir conta**: só o admin mestre vê o botão de excluir na tabela "Contas existentes" —
  apaga a conta e todos os dados dela (farme, rush, alertas). Não dá pra excluir a própria
  conta.
- **Editar login de qualquer conta**: card novo "Editar login (admin mestre)" — troca usuário
  e/ou senha de qualquer conta, inclusive de outros admins.
- A conta do admin mestre fica protegida: nenhum outro admin consegue promovê-la/rebaixá-la
  ou mudar a guild dela — só o próprio mestre.
- `is_master_admin` só é setável direto no banco (nunca pela API), pra não ter caminho de
  escalar privilégio pelo app.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`, mas
ninguém fica como mestre automaticamente; rode o `UPDATE` manualmente pra promover sua conta.

## Alerta de inatividade (watchdog)

Se seu banco já rodou `sql/migrate_master_admin.sql`, rode agora
`sql/migrate_watchdog_alerts.sql` no phpMyAdmin (aba SQL) — adiciona 2 colunas em
`alert_settings`. Dois alertas novos, configuráveis em minutos na página Alertas (mesmo card
"Configuração" de sempre):

- **Sem nenhum drop** (padrão 1 min): o arquivo só grava linha quando dropa algo, então
  silêncio total é forte indício de que o helper/macro travou.
- **Item rastreado sumiu** (padrão 60 min): um item específico com alerta ativo não aparece
  há muito tempo — limite bem mais alto que o de cima, já que um item raro pode legitimamente
  demorar mais mesmo com tudo funcionando.

Cada alerta dispara uma vez por período de silêncio (não fica repetindo a cada poll) e volta
a valer normalmente assim que o item/qualquer drop aparecer de novo. Só funciona com o arquivo
conectado ao vivo (não se aplica a upload manual/CSV).

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Jogadores online

Se seu banco já rodou `sql/migrate_watchdog_alerts.sql`, rode agora
`sql/migrate_online_presence.sql` no phpMyAdmin (aba SQL) — adiciona a coluna `last_seen_at`
em `users`. Badge verde no topo do menu lateral mostrando quantas contas estiveram ativas nos
últimos 3 minutos: o app manda um ping pro servidor a cada 1 min enquanto a aba está aberta
(`api/heartbeat.php`), então o número pode ficar levemente atrasado, nunca em tempo real
exato.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Interruptor manual do watchdog

Se seu banco já rodou `sql/migrate_online_presence.sql`, rode agora
`sql/migrate_watchdog_toggle.sql` no phpMyAdmin (aba SQL) — adiciona a coluna
`watchdog_enabled` em `alert_settings`. Os alertas de inatividade (sem drop nenhum / item
sumiu) agora ficam **desligados por padrão** atrás de um interruptor próprio na página Alertas
("Vigilância de inatividade"), separado do "Ativar notificações" geral — farmar manual tem
pausas normais que não deveriam soar como "helper travado", então o usuário liga esse
interruptor só quando estiver de fato rodando o helper/macro. Ligar reseta o relógio de
inatividade pra agora, não conta o tempo parado antes de ligar.

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Lista de desejos + correio

Se seu banco já rodou `sql/migrate_watchdog_toggle.sql`, rode agora
`sql/migrate_wishlist.sql` no phpMyAdmin (aba SQL) — cria as tabelas `wishlist_items` e
`wishlist_matches`. Nova página **Lista de desejos** no menu:

- Cada jogador marca os itens que quer comprar (qualquer nome, não só os da lista de ranking
  do admin).
- Quando **qualquer outro** jogador da guild dropar um item que bate com a lista de alguém, o
  dono recebe um aviso (som + pop-up + notificação do SO, igual os outros alertas) com o nick
  de quem dropou — a negociação em si (preço, forma de pagamento) fica por fora do app.
- O aviso chega pelo mesmo ping de presença de 1 min que já existe (`api/heartbeat.php`), então
  pode demorar até 1 min pra aparecer depois do drop.
- O casamento de nome usa a mesma normalização de acento/maiúscula do resto do app — depende
  da extensão `intl` do PHP (`Normalizer`) pra funcionar direito; sem ela, ainda funciona mas
  fica sensível a acento (a maioria dos hosts, incluindo Hostinger, já vem com `intl`).

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Horários de eventos (TG/World Boss) + sons customizados

Se seu banco já rodou `sql/migrate_wishlist.sql`, rode agora `sql/migrate_event_alerts.sql`
no phpMyAdmin (aba SQL) — cria as tabelas `event_schedule` e `alert_sounds`. Dois cards novos
na página Admin:

- **Horários de eventos**: o admin cadastra os horários fixos de TG e World Boss (agenda
  compartilhada — cadastra 1x, todo mundo recebe). Quando o horário chega, todo jogador logado
  recebe um pop-up + som (mesmo com o navegador em segundo plano) — o horário é comparado com
  a hora local do navegador de cada um, então cadastre pensando no horário de Brasília, igual
  todo mundo já vê no jogo.
- **Sons dos alertas**: o admin pode enviar um arquivo .mp3/.wav/.ogg (até 2MB) pra TG, World
  Boss e pro alerta de inatividade (watchdog), substituindo o bipe sintetizado padrão. Sem
  upload nenhum, tudo continua funcionando com o bipe de sempre.

**Passo manual extra (só na primeira vez)**: pelo Gerenciador de Arquivos da Hostinger, crie a
pasta `uploads/sounds/` na raiz do site (irmã de `api/`/`js/`) com permissão de escrita — o
deploy via git não cria pasta vazia sozinho. Se o upload de som falhar mesmo com arquivo
pequeno, pode ser o `upload_max_filesize`/`post_max_size` do PHP do host — na maioria dos
planos já vem alto o suficiente pra 2MB, mas vale checar no painel se der erro.

Instalação nova do zero: banco já vem no `sql/schema.sql`, mas a pasta `uploads/sounds/`
precisa ser criada manualmente do mesmo jeito.

## Preço de item vira individual por jogador

Se seu banco já rodou `sql/migrate_event_alerts.sql`, rode agora
`sql/migrate_personal_item_prices.sql` no phpMyAdmin (aba SQL). Antes, um item tinha **um só
preço compartilhado** — se qualquer jogador mudasse o preço de "Joia Rara", o "Total de farme"
de todo mundo que tinha esse item mudava junto, o que não fazia sentido (cada um vende pelo
valor que quiser). Agora:

- **Preço é individual** — cada conta tem o próprio valor por item.
- **Nome do item continua compartilhado** — o autocompletar em Cálculo de farme sugere nomes
  que qualquer jogador da guild já cadastrou (só o nome, nunca o preço de ninguém), e o card
  "Atribuir categorias" em Admin também enxerga o catálogo completo, não só os itens do admin
  logado.
- **Migração**: cada conta que já existia herda uma **cópia** do preço que já estava
  cadastrado pra cada item — ninguém perde o que já tava calculado, e cada um pode editar pro
  próprio valor depois. A tabela antiga fica guardada como `item_prices_shared_backup`; depois
  de conferir que os valores migraram certo, dá pra rodar `DROP TABLE
  item_prices_shared_backup;` pra limpar.

Instalação nova do zero já vem com a estrutura final no `sql/schema.sql` — sem preço legado
pra herdar, ninguém precisa fazer nada extra.

## Interruptor pessoal de notificação de TG/World Boss

Se seu banco já rodou `sql/migrate_personal_item_prices.sql`, rode agora
`sql/migrate_event_notification_toggle.sql` no phpMyAdmin (aba SQL) — adiciona 2 colunas em
`alert_settings`. Cada jogador ganha, na página Alertas, dois interruptores próprios
("Notificação de TG" / "Notificação de World Boss") pra ligar/desligar se quer receber o
pop-up/som desses eventos — sem poder editar horário nem nada, isso continua só do admin.
Ligados por padrão (preserva o comportamento de quem já usava antes dessa opção existir).

Instalação nova do zero não precisa desse script — já vem tudo no `sql/schema.sql`.

## Notificação de TG/World Boss fora do app (push + Telegram)

Até aqui, o aviso de TG/World Boss só chega se o navegador estiver aberto (mesmo em segundo
plano). Essa seção adiciona dois canais que chegam com o **navegador fechado**: notificação
push do próprio navegador (via serviço gratuito OneSignal) e mensagem no Telegram — além de um
comando `/drop` no bot pra consultar quanto já dropou hoje (ou `/drop <nome>` pra ver o total acumulado de um item específico).

Se seu banco já rodou `sql/migrate_event_notification_toggle.sql`, rode agora
`sql/migrate_push_telegram.sql` no phpMyAdmin (aba SQL) — adiciona `push_enabled` e
`telegram_chat_id` em `alert_settings`, e cria as tabelas `telegram_link_codes` e
`event_schedule_deliveries`. Instalação nova do zero não precisa desse script — já vem tudo no
`sql/schema.sql`.

**1. Criar a peça central: algo que rode o `cron-check-events.php` a cada minuto.** Sem isso,
nada deste recurso funciona com o navegador fechado — é o servidor, sozinho, que verifica a
cada minuto se algum horário de TG/World Boss bateu e dispara. O script aceita ser acionado de
dois jeitos, use o que funcionar na sua hospedagem:

**Opção A — Cron Job da Hostinger (CLI).** No hPanel: **Avançado → Cron Jobs** → criar um novo,
frequência **a cada 1 minuto**. Selecione o modo **"Personalizado"** (o modo "PHP" da Hostinger
em algumas contas não prefixa o interpretador direito e dá `Permission denied`) e cole o
comando completo, ajustando o caminho pro real da sua conta (aparece no próprio painel ou no
Gerenciador de Arquivos):

```
/usr/bin/php /home/SEU_USUARIO/public_html/SUA_PASTA/api/cron-check-events.php
```

**Opção B — Cron externo por HTTP (se o Cron Job da Hostinger não executar).** Em alguns planos
o cron da Hostinger simplesmente não roda (nem um script de teste mínimo). Nesse caso, use um
serviço gratuito de cron externo (ex: **cron-job.org**) apontando pra esta URL, a cada 1
minuto:

```
https://SEU_DOMINIO/api/cron-check-events.php?token=SEU_TELEGRAM_WEBHOOK_SECRET
```

O `token` é o mesmo valor do `TELEGRAM_WEBHOOK_SECRET` do `config.php` (ou o `CRON_HTTP_SECRET`,
se você preencheu um dedicado). Sem token válido a URL retorna 403 — não é acionável por
qualquer um. **Bônus:** abrir essa mesma URL no navegador roda o script na hora e mostra o
diagnóstico (horário calculado, destinatários, envios) — ótimo pra testar sem esperar o cron.

**2. Criar conta grátis no OneSignal (push do navegador).**

1. Crie uma conta em onesignal.com e um app novo, plataforma **Web Push**.
2. Configure com a URL do seu site (`https://farmehelper.pablokonrath.com` ou o domínio que
   você usa) e permita que o SDK sirva os arquivos `OneSignalSDKWorker.js` da raiz do site
   (esse arquivo já vem no repositório, na raiz, do lado do `index.html`).
3. No painel do app criado, pegue o **App ID** (Settings → Keys & IDs) e a **REST API Key**.

**3. Criar o bot do Telegram.**

1. No Telegram, converse com **@BotFather**, mande `/newbot` e siga o passo a passo (nome +
   username do bot, que precisa terminar em `bot`).
2. O BotFather devolve um **token** (formato `123456:ABC-DEF...`) — guarde, é secreto.
3. Anote também o **username** do bot (sem o @), vai virar o link `t.me/SeuBotUsername`.

**4. Preencher as constantes no `config.php` do servidor.** Pelo Gerenciador de Arquivos da
Hostinger, abra o `api/config.php` real (o daqui do repositório é só um template — esse arquivo
nunca é enviado pelo deploy automático, ver `.gitignore`) e preencha as 5 constantes que já
existem lá como placeholder vazio:

```php
define('ONESIGNAL_APP_ID', 'seu-app-id-aqui');
define('ONESIGNAL_REST_API_KEY', 'sua-rest-api-key-aqui');
define('TELEGRAM_BOT_TOKEN', 'seu-token-aqui');
define('TELEGRAM_BOT_USERNAME', 'SeuBotUsername');
define('TELEGRAM_WEBHOOK_SECRET', 'invente-uma-senha-aleatoria-aqui');
```

`TELEGRAM_WEBHOOK_SECRET` não vem de lugar nenhum — é você quem inventa uma string aleatória
longa (ex: gere em https://www.uuidgenerator.net/ ou similar); ela só precisa bater entre esse
arquivo e o passo 5 abaixo.

**5. Registrar o webhook do bot (uma vez só).** Depois de preencher o `config.php` no servidor,
abra esta URL no navegador uma única vez (troque `SEU_TOKEN`, `SEU_DOMINIO` e `SEU_SECRET`
pelos valores reais — `SEU_SECRET` é o mesmo `TELEGRAM_WEBHOOK_SECRET` do passo anterior):

```
https://api.telegram.org/botSEU_TOKEN/setWebhook?url=https://SEU_DOMINIO/api/telegram-webhook.php&secret_token=SEU_SECRET
```

Deve responder `{"ok":true,"result":true,...}`. Isso avisa o Telegram pra mandar toda mensagem
recebida pelo bot direto pro `telegram-webhook.php` do site.

**Como o jogador ativa, na página Alertas do FarmHub:**

- **Push**: liga o interruptor "Notificação push do navegador" — o navegador vai pedir
  permissão de notificação.
- **Telegram**: clica em "Gerar código de vínculo", abre o link `t.me/...` que aparece (ou
  manda `/start CODIGO` pro bot manualmente), o bot confirma o vínculo. De lá em diante também
  responde `/drop` (sem nada depois) com a lista de tudo que esse jogador dropou hoje, ou
  `/drop <nome do item>` com o total acumulado de um item específico.

Se as 5 constantes ficarem em branco no `config.php`, o resto do site funciona normalmente —
só esses dois canais ficam indisponíveis (o botão de gerar código do Telegram avisa que ainda
não foi configurado).

## Drops rastreados no Telegram (/drop + envio na hora)

Se seu banco já rodou `sql/migrate_push_telegram.sql`, rode agora
`sql/migrate_tracked_drop_telegram.sql` no phpMyAdmin (aba SQL) — adiciona
`telegram_drop_relay_enabled` em `alert_settings` e cria a tabela `tracked_drop_counts_daily`.
Instalação nova do zero não precisa — já vem no `sql/schema.sql`.

Duas coisas:

- **`/drop` agora mostra os itens RASTREADOS do próprio jogador** (a lista pessoal de palavras
  rastreadas, tipo Fatal/Chocante/Dragona/joias), não mais a lista de ranking do admin — que era
  o que causava dados que não batiam. `/drop` sozinho lista o que caiu hoje; `/drop <nome>` dá o
  total acumulado do item.
- **Envio na hora**: na página Alertas, com o Telegram vinculado, aparece o interruptor "Enviar
  drops rastreados pro Telegram". Ligado, cada item rastreado que cair chega como mensagem no
  Telegram na hora. **Importante:** isso só funciona com o **FarmHub aberto** (mesmo minimizado,
  em segundo plano) — quem detecta o drop é a aba lendo o log do jogo, então com o navegador
  totalmente fechado não há como saber que um item caiu. Diferente do TG/World Boss, que são
  horários fixos e por isso o servidor consegue avisar sozinho.

Dois comandos a mais no bot, sem migração nenhuma (reaproveitam tabelas que já existem):

- **`/farm`** — quanto vale em Alz o que caiu hoje (só os itens rastreados com preço cadastrado
  em Cálculo de farme), do maior valor pro menor, com o total no fim.
- **`/sessao`** — qual DG está sendo farmada agora (se você marcou uma em Sessões de farme), há
  quanto tempo, e as runs feitas hoje — inclusive a fração contra o planejado no rush do dia,
  quando essa DG estiver no rush salvo de hoje.

## Aviso de lista de desejos no Telegram

Se seu banco já rodou `sql/migrate_tracked_drop_telegram.sql`, rode agora
`sql/migrate_wishlist_telegram.sql` no phpMyAdmin (aba SQL) — adiciona
`telegram_wishlist_relay_enabled` em `alert_settings`. Instalação nova do zero não precisa — já
vem no `sql/schema.sql`.

Na página Alertas, com o Telegram vinculado, aparece o interruptor "Avisar quando dropar meu
desejo". Ligado, quando **outra pessoa** dropa um item da sua lista de desejos, chega uma
mensagem no seu Telegram com o item e **quem dropou** (nick + guild), pra você chamar a pessoa e
negociar. **Diferente do envio de drops rastreados, este funciona até com o seu navegador
fechado** — porque quem detecta e reporta o drop é o navegador de quem dropou (via
`wishlist-check.php`), não o seu.

## Aviso de travamento (watchdog) no Telegram

Se seu banco já rodou `sql/migrate_wishlist_telegram.sql`, rode agora
`sql/migrate_watchdog_telegram.sql` no phpMyAdmin (aba SQL) — adiciona
`telegram_watchdog_relay_enabled` em `alert_settings`. Instalação nova do zero não precisa — já
vem no `sql/schema.sql`.

Duas melhorias no watchdog (a Vigilância de inatividade):

- **Aviso no Telegram**: com o Telegram vinculado, aparece em Alertas o interruptor "Avisar
  travamento (watchdog) no Telegram". Ligado, quando o helper trava (fica sem drop) o aviso
  chega no seu Telegram, não só no PC — bom pra quem farma AFK longe do computador. Precisa do
  watchdog ligado e do FarmHub aberto (é a aba que detecta o travamento).
- **Repete até voltar a farmar**: o aviso de "sem nenhum drop" agora se repete a cada intervalo
  do limite configurado enquanto continuar parado (antes avisava 1 vez só e parava), e para
  sozinho assim que cai um drop de novo. Vale pro aviso na tela e pro Telegram.

## Limites de escala (o que segura o banco com muita gente)

Duas proteções pra hospedagem compartilhada não sofrer com muitos jogadores farmando ao mesmo
tempo — nenhuma exige migração de banco, já vêm no código:

1. **Envio de contagem no máximo 1x por minuto.** Farmando, o cliente recalcula as contagens a
   cada poucos segundos; sem limite, muita gente junto viraria escrita constante demais. O
   `syncTrackedDropCounts()` (js/features/leaderboard.js) agora junta essas chamadas num envio
   por minuto (com um envio final garantido quando para de farmar). **Não afeta notificação
   nenhuma** — alerta de drop e aviso de desejo no Telegram são caminhos separados que disparam
   na hora; só o Ranking e o `/drop` podem ficar até 1 min atrasados.
2. **Teto de 31 dias de histórico.** `drop-counts-daily.php` e `tracked-drop-counts.php` ignoram
   datas com mais de 31 dias. O arquivo do jogo já só guarda ~30 dias, então no uso normal não
   muda nada — é rede de segurança contra um cliente despejar data velha e inflar as tabelas.

O gargalo real com muita gente é **volume de escrita simultânea** (não espaço em disco), e ele
escala com quem está **farmando ao mesmo tempo**, não com o total cadastrado. Se um dia
precisar de centenas farmando em paralelo de forma sustentada, o limite passa a ser a própria
hospedagem compartilhada, e o caminho seria migrar pra um VPS — mas isso está bem longe pra uma
guild. Um próximo passo barato, se aparecer abuso, é limitar o nº de palavras rastreadas por
pessoa (mínimo de letras + máximo de palavras).

## Migrando de usuário único pra multiusuário

Se seu banco já está em produção com dados de uma versão anterior (sem a tabela `users`),
**não rode `sql/schema.sql`** — ele recriaria as tabelas do zero e perderia tudo. Em vez
disso:

1. Abra `api/config.php` no servidor e copie o valor atual de `AUTH_PASSWORD_HASH` (a linha
   toda, começando com `$2y$...`) — vai precisar dele no próximo passo.
2. No phpMyAdmin, aba **SQL**, cole o conteúdo de `sql/migrate_to_multiuser.sql`, mas antes
   troque `<COLE_O_HASH_ATUAL_AQUI>` pelo hash que você copiou no passo 1, e `pablokonrath`
   pelo username que você quiser pra sua conta. Execute.
3. Confirme no phpMyAdmin que a tabela `users` tem 1 linha, e que as tabelas `rush_history`,
   `manual_drops`, `tracked_keywords`, `app_settings`, `alert_settings`, `alert_history`
   ganharam a coluna `user_id` preenchida com o id dessa linha.
4. Apague a linha `define('AUTH_PASSWORD_HASH', ...)` do `api/config.php` — não é mais usada.
5. Teste o login com o username escolhido no passo 2 e a **mesma senha de sempre** (o hash
   foi reaproveitado, não muda). Confirme que os dados antigos continuam todos lá.

## Recuperando dados de um endereço antigo (localhost, VSCode Live Server, etc)

A migração automática do passo 5.3 só funciona se você acessar o site novo **no mesmo
navegador e mesmo endereço** de onde os dados antigos estão salvos — o navegador isola
`localStorage` por endereço (origem), então dados salvos em `http://localhost:5500` (ex:
Live Server do VSCode) não aparecem sozinhos quando você abre `https://seudominio.com`,
mesmo sendo o mesmo navegador e o mesmo projeto. Nesse caso, faça a transferência manual:

`export-legacy-data.html` e `import-data.html` não fazem mais parte do deploy automático
(ficam só no seu projeto local, fora do git — veja `.gitignore`), porque são ferramentas de
uso pontual e não devem ficar publicadas permanentemente. Quando precisar:

1. No navegador onde os dados antigos estão, abra o servidor local como antes (ex: Live
   Server na mesma porta de sempre) e navegue até `export-legacy-data.html` (em vez de
   `index.html`). Clique em **Exportar dados como .json** — baixa um arquivo
   `droplist-backup.json`.
2. Suba `export-legacy-data.html`/`import-data.html` manualmente pro servidor (Gerenciador
   de Arquivos) só por enquanto.
3. Acesse o site novo (`https://seudominio.com`) e faça login normalmente.
4. Nesse mesmo navegador, acesse `https://seudominio.com/import-data.html`, escolha o
   arquivo `droplist-backup.json` baixado no passo 1, e clique em **Importar**.
5. Volte pro `index.html` — os dados devem aparecer.
6. Apague os dois arquivos do servidor de novo (ferramenta de recuperação pontual — deixar
   `import-data.html` no ar permite que qualquer sessão logada sobrescreva os dados do
   banco por ele).

## Itens esperados por DG (cadastro manual)

Se seu banco já rodou `sql/migrate_wishlist.sql` (ou qualquer migração mais recente), rode agora
`sql/migrate_item_dungeon_sources.sql` no phpMyAdmin (aba SQL) — cria a tabela
`item_dungeon_sources`. Instalação nova do zero não precisa — já vem no `sql/schema.sql`.

Novo card **"Itens × DGs (cadastro manual)"** na página **Onde dropa**, visível só pro admin
mestre: cadastre um item e marque em quais DGs ele pode cair (curado por você — diferente da
busca da mesma página, que é estatística, baseada no histórico de sessões). Isso alimenta um
destaque em **Sessões de farme**: itens que caem numa sessão e já eram esperados naquela DG
ganham uma estrela dourada, tanto no histórico quanto na sessão "Farmando agora".

## Ícone por DG

Em **Sessões de farme** (card "Farmando agora" e a coluna DG do histórico), cada DG pode mostrar
um ícone próprio. Não tem cadastro nenhum pelo app — é só colocar o arquivo, por convenção de
nome, dentro de `icons/dungeons/`:

```
icons/dungeons/d1.png    ← id da DG (ver js/state/app-state.js, DEFAULT_DUNGEONS, ou o
icons/dungeons/d35.png     valor salvo em dungeonList) + .png
```

DG sem arquivo cai automaticamente num ícone genérico de espada — não precisa cadastrar todas de
uma vez, dá pra ir subindo aos poucos. Sobe os arquivos direto pelo Gerenciador de Arquivos da
Hostinger (ou versiona no git, se o deploy automático estiver configurado) — não precisa mexer
em nenhum código pra um ícone novo aparecer.

## Imagem de fundo por DG (card "Farmando agora")

Mesma ideia do ícone, mas é a arte grande que fica atrás do card enquanto a sessão está rolando.
Também é só convenção de nome, dentro de `uploads/imagens/`:

```
uploads/imagens/bg-solo.jpg              ← primeira palavra do nome da DG
uploads/imagens/bg-dx-premium-do-fogo.jpg  ← nome inteiro, quando o prefixo repete
```

O app tenta o nome inteiro primeiro, depois a primeira palavra, `.jpg` antes de `.png`, e se
nenhum existir simplesmente não mostra fundo nenhum (ver `dgBackground` em
`js/pages/sessions-page.js`). Ou seja: use a primeira palavra quando ela já for única
(`bg-tumba.jpg`, `bg-terminus.jpg`) e o nome inteiro quando não for — as 4 DX Premium, os 3
Templos, as 2 Torres.

**Comprima antes de subir.** A arte costuma vir em PNG de 2 a 3 MB, e PNG guarda foto sem perda —
o que foto não aproveita. Em JPEG a mesma imagem fica ~10x menor, e a 42% de opacidade atrás do
card a diferença não se vê. Com 42 DGs, a pasta iria pra ~100 MB de banda em toda primeira visita.

Jogue os PNGs em `uploads/imagens/` e rode, da raiz do projeto:

```
powershell -ExecutionPolicy Bypass -File tools\comprimir-imagens.ps1
```

Ele converte tudo pra JPEG qualidade 82 e move os PNGs originais pra `arte-original/` (que está
no `.gitignore`, então não vai pro repo nem pro FTP). Depois é só subir `uploads/imagens/`.

## Contas vinculadas (comparar duas contas do mesmo jogador)

Quem joga com uma conta secundária pode vincular as duas e comparar o farme diário lado a lado,
na página **Contas**. Rode uma vez, no phpMyAdmin:

```
sql/migrate_linked_accounts.sql
```

E suba `api/account-link.php` e `api/daily-summary.php` (arquivos novos).

**Como o jogador usa:** entra na conta secundária → Contas → "Gerar código" → copia → entra na
principal → cola em "Vincular". O código vale 30 minutos e serve uma vez. O vínculo é mútuo: a
comparação passa a abrir nos dois logins.

**O que atravessa o vínculo:** só o resumo do dia (farmado, gasto em rush, vendido, runs, tempo,
DG que mais rendeu). Sessões, drops, preços, vendas, metas e alertas continuam estritamente
isolados por conta — a única consulta que cruza usuários é o GET de `daily-summary.php`, e ela é
autorizada pelo JOIN com `linked_accounts`, sem ler nenhum id vindo da requisição.

**Cada conta publica o próprio resumo** a cada 2 minutos enquanto o app está aberto. Por isso a
tela mostra a hora da última publicação da outra conta: se ela não abriu o FarmHub hoje, o dia
dela não existe ali — e a página diz "não publicado" em vez de mostrar zero, que se leria como
"não farmou".

**Um detalhe importante pra quem usa duas contas no mesmo navegador:** a conexão ao vivo (o
arquivo de log) é guardada por usuário desde a versão que introduziu isso. Antes era uma chave só
pro site inteiro, e entrar na segunda conta reconectava sozinho no log da primeira, jogando o
farme de uma no histórico da outra sem nada aparecer na tela. Se você já usava o app antes dessa
mudança, nada muda: o registro antigo é adotado pela primeira conta que abrir o app.

O ideal é cada conta ter a **própria instalação do jogo**, com seu próprio arquivo `DropList` —
aí dá pra deixar duas abas abertas, cada uma logada numa conta e conectada no seu arquivo,
farmando as duas ao mesmo tempo sem misturar nada. Com uma instalação só, as duas contas gravam
no mesmo log e não existe como separar: farme uma de cada vez.

## Rotas de DGs + comparativo de lucro

Se seu banco já rodou `sql/migrate_item_dungeon_sources.sql` (ou qualquer migração mais
recente), rode agora `sql/migrate_rush_routes.sql` no phpMyAdmin (aba SQL) — cria a tabela
`rush_routes`. Instalação nova do zero não precisa — já vem no `sql/schema.sql`.

Duas coisas novas, pessoais por conta (nada compartilhado):

- **Rotas** (card "Minhas rotas" em Planejamento de Rush): monte o carrinho normalmente e clique
  "Salvar como rota" pra guardar aquele conjunto de DGs + repetições como um molde reutilizável,
  sem data fixa (diferente de "Salvar rush do dia", que fica preso àquele dia). Aplicar uma rota
  carrega ela no carrinho com os preços de HOJE — a rota nunca guarda preço, só a composição.
- **Comparativo de lucro** (card "Qual rota rende mais" em Sessões de farme, logo abaixo de "Qual
  DG rende mais"): pra cada rota, soma o Alz/run histórico de cada DG × repetições (retorno
  esperado) e subtrai o custo de rodar nos preços atuais — mostra o lucro líquido, ranqueado da
  melhor pra pior. DG da rota sem sessão farmada ainda não entra no retorno (sinalizado com um
  aviso), pra não estimar lucro de algo sem dado nenhum.

## Editar rota + agrupar sessões por rota no histórico

Se seu banco já rodou `sql/migrate_rush_routes.sql`, rode agora
`sql/migrate_dg_session_routes.sql` no phpMyAdmin (aba SQL) — adiciona `route_id`/`route_name`
em `dg_sessions`. Instalação nova do zero não precisa — já vem no `sql/schema.sql`. **Não é
urgente**: `api/dg-sessions.php` funciona normalmente mesmo sem rodar essa migração (cai
sozinho pra um modo sem essas colunas), só o agrupamento por rota no histórico não persiste
entre sessões de navegador até a migração rodar.

- **Editar rota**: além de aplicar/renomear/excluir, agora dá pra editar de verdade (ícone de
  lápis em "Minhas rotas") — carrega a rota no carrinho, você ajusta as DGs/repetições, e
  "Salvar alterações da rota" sobrescreve a mesma rota em vez de criar outra.
- **Tempo estimado**: a lista de rotas agora mostra uma coluna com o tempo total estimado
  (mesma conta usada na sugestão por tempo em Sessões de farme).
- **Agrupamento por rota no histórico**: sessão iniciada numa DG que fazia parte da última rota
  aplicada no carrinho herda o rótulo dela — o histórico em Sessões de farme agrupa essas
  sessões sob o nome da rota, com o farme avulso (fora de qualquer rota) junto em "Avulsas".

## Cache do navegador depois de um deploy

O app não usa build tool nem hash no nome dos arquivos (ver convenção do projeto), então o
navegador não tinha como saber sozinho que `js/*.js`/`css/styles.css`/`index.html` mudaram
depois de um `git push` — quem já tinha o site aberto podia continuar rodando código velho até
dar um hard refresh manual (Ctrl+Shift+R). O `.htaccess` na raiz resolve isso: manda
`Cache-Control: no-cache, must-revalidate` pra esses arquivos, então o navegador sempre confere
com o servidor antes de usar a cópia salva (troca por um 304 quando nada mudou — continua rápido,
só não fica desatualizado). Depende do Apache da Hostinger ter `mod_headers` ativo (padrão em
hospedagem compartilhada comum). Ícones/imagens não entram nessa regra — esses continuam com
cache normal do navegador, não mudam a cada deploy.

## Histórico permanente de drops (IMPORTANTE — passo manual)

O log do jogo guarda cerca de 30 dias. Até esta versão, os drops eram lidos do arquivo e nunca
gravados no banco: **todo farme mais antigo que a janela do log sumia pra sempre**, e a Visão
geral mostrava um "Total de farme" incompleto em qualquer período mais antigo, sem avisar
(medido: um filtro de 180 dias exibia 17% do farme real).

Rode `sql/migrate_drop_snapshots.sql` no phpMyAdmin (aba **SQL**) — cria a tabela
`drop_snapshots`, que guarda o agregado por dia+item (algumas centenas de linhas por dia, não os
drops individuais). É aditivo: não altera nem apaga nenhuma tabela existente.

**Enquanto a migração não roda**, o app continua funcionando normal — a chamada do histórico
falha silenciosamente e ele opera só com a janela do log, exatamente como antes. Depois de rodar,
o arquivamento começa sozinho a cada carregamento do log.

Detalhes de comportamento:

- Guarda só a **quantidade** por dia+item; o valor em Alz continua calculado na hora com o preço
  atual de Cálculo de farme, então o histórico não congela com preços velhos.
- **Auto-cura**: como o log sempre traz os últimos ~30 dias, cada sincronização reafirma esse
  período inteiro (upsert por dia+item). Um dia só passa a depender exclusivamente do banco
  depois de já ter sido gravado dezenas de vezes.
- A Visão geral costura as duas fontes sem contar nada duas vezes: dentro da janela do log manda
  o log (exato, inclui hoje); antes dela, o banco. Se o período pedido tem dias que nenhuma das
  duas cobre (anteriores ao início do arquivamento), a página **avisa** em vez de mostrar um
  total incompleto em silêncio.

## Se algo der errado

- **Tela branca depois do login**: geralmente é erro de conexão com o banco — confira
  `api/config.php` (nome/usuário/senha do banco) e veja a aba Network do navegador
  (F12) pra ver o corpo da resposta de qualquer chamada `api/*.php` que tenha falhado.
- **Sempre volta pra tela de login mesmo com a senha certa**: verifique se o site está
  sendo acessado por HTTPS — o cookie de sessão é marcado como seguro quando `HTTPS` está
  ativo no servidor, então acessar por `http://` (sem "s") pode impedir o cookie de ficar
  salvo dependendo da configuração do servidor. Prefira sempre `https://seudominio.com`.
- **DGs sumiram/lista vazia depois de migrar**: não deveria acontecer (o app sempre manda a
  lista padrão de DGs se você nunca customizou a sua), mas se acontecer, rode de novo o
  `sql/schema.sql` do zero (ele recria as tabelas vazias) e recarregue a página pra
  disparar a migração de novo — só funciona uma vez por navegador, então se precisar
  forçar de novo, apague a chave `droplist.migratedToBackend` do localStorage (F12 →
  Application → Local Storage) antes de recarregar.
