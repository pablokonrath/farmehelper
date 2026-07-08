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
   **SQL** e cole o conteúdo do arquivo `sql/schema.sql` deste projeto. Execute.
4. Confirme que 8 tabelas apareceram: `item_prices`, `rush_history`, `tracked_keywords`,
   `app_settings`, `dungeons`, `manual_drops`, `alert_settings`, `alert_history`.

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

## 4. Definir a senha de login

`api/generate-password-hash.php` não faz parte do deploy automático via git (está fora do
repositório, veja `.gitignore`) — precisa subir ele manualmente só quando for gerar/trocar a
senha.

1. Suba `api/generate-password-hash.php` pro servidor manualmente (Gerenciador de Arquivos),
   dentro da pasta `api/`.
2. Pelo navegador, acesse `https://seudominio.com/api/generate-password-hash.php`.
3. Digite a senha que você quer usar pra entrar no DropList e clique em **Gerar hash**.
4. Copie o texto gerado (começa com `$2y$...`) e cole em `api/config.php`:
   ```php
   define('AUTH_PASSWORD_HASH', '$2y$10$....(o hash que você copiou)....');
   ```
5. **Apague o arquivo `api/generate-password-hash.php` do servidor** — ele não deve ficar
   no ar depois de gerar o hash (e como não está no git, não volta sozinho no próximo deploy).

## 5. Testar

1. Acesse `https://seudominio.com` — deve aparecer a **tela de login**, não o painel direto.
2. Digite a senha configurada no passo 4. Deve entrar no app.
   - Se aparecer "Backend ainda não configurado": esqueceu de preencher `AUTH_PASSWORD_HASH`.
   - Se aparecer "Senha incorreta" mesmo com a senha certa: confira se colou o hash certo
     (sem espaços extras) e se `generate-password-hash.php` gerou pra bcrypt mesmo.
3. **Se esse navegador já tinha dados salvos** (preços, rush, DGs) de quando o DropList
   ainda usava só localStorage: no primeiro login, o app deve migrar tudo automaticamente
   pro banco (isso acontece sozinho, sem precisar apertar nada). Confira no phpMyAdmin se
   as tabelas `item_prices`/`rush_history`/etc. ficaram com os dados esperados.
4. Adicione um preço de item ou salve um rush, dê F5 na página — o dado deve continuar lá
   (agora vindo do banco, não mais do localStorage do navegador).
5. Teste o botão **Sair** (logout) no rodapé da barra lateral, e confirme que a senha errada
   é rejeitada.

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
