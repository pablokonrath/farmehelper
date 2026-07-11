# Deploy do DropList na Hostinger

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
   a pasta de destino (a raiz pública do domínio/subdomínio onde o DropList vai ficar).
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
2. Envie **todo o conteúdo** deste projeto pra lá: `index.html`, as pastas `css/`, `js/`,
   `api/` — mas **não** envie a pasta `sql/` (não precisa ficar público) nem `.claude/`.

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
3. **Se esse navegador já tinha dados salvos** (preços, rush, DGs) de quando o DropList
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
usar a tela **Admin** dentro do próprio DropList — sem precisar mexer no phpMyAdmin. Se ainda
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
2. Recarregue o DropList e loga de novo — deve aparecer um item **Admin** novo na barra
   lateral, só na sua conta.
3. Pra criar conta de outra pessoa, usa essa tela em vez do phpMyAdmin daqui pra frente.
4. Na tela **Admin**, card **"Itens do ranking"**, cadastre os itens que devem entrar no
   ranking (ex: "Extensor Altíssimo") — essa lista é global, só admin edita.
5. O ranking (item **Ranking** na barra lateral) começa vazio pra cada item cadastrado — ele
   se preenche sozinho conforme o arquivo de log de cada pessoa for lido/atualizado
   (sincroniza a contagem automaticamente, sem precisar fazer nada manual em cada conta).

Se você está instalando o DropList do zero (nunca rodou nenhuma migração antes), não precisa
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
