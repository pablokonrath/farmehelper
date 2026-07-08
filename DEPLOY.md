# Deploy do DropList na Hostinger

Passo a passo pra colocar o backend PHP/MySQL no ar. Tudo aqui é feito pelo hPanel da
Hostinger (painel de controle da hospedagem) — nenhum acesso SSH é necessário.

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

1. Pelo navegador, acesse `https://seudominio.com/api/generate-password-hash.php`.
2. Digite a senha que você quer usar pra entrar no DropList e clique em **Gerar hash**.
3. Copie o texto gerado (começa com `$2y$...`) e cole em `api/config.php`:
   ```php
   define('AUTH_PASSWORD_HASH', '$2y$10$....(o hash que você copiou)....');
   ```
4. **Apague o arquivo `api/generate-password-hash.php` do servidor** — ele não deve ficar
   no ar depois de gerar o hash.

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

1. No navegador onde os dados antigos estão, abra o servidor local como antes (ex: Live
   Server na mesma porta de sempre) e navegue até `export-legacy-data.html` (em vez de
   `index.html`). Clique em **Exportar dados como .json** — baixa um arquivo
   `droplist-backup.json`.
2. Acesse o site novo (`https://seudominio.com`) e faça login normalmente.
3. Nesse mesmo navegador, acesse `https://seudominio.com/import-data.html`, escolha o
   arquivo `droplist-backup.json` baixado no passo 1, e clique em **Importar**.
4. Volte pro `index.html` — os dados devem aparecer.
5. Depois de confirmar que migrou tudo certo, apague `export-legacy-data.html` e
   `import-data.html` do servidor (ferramentas de recuperação pontual, não precisam
   ficar publicadas — qualquer um com a URL e uma sessão logada consegue sobrescrever
   os dados do banco via `import-data.html`).

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
