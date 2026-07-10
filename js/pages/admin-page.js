import { AppState } from '../state/app-state.js';
import { formatDateTimeBR } from '../utils/formatting.js';

export function renderAdminPage() {
  return `
<div class="pg-title"><i class="ti ti-shield-lock"></i>Admin</div>
<div class="pg-sub">Crie contas pra outras pessoas da guild usarem o DropList.</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-user-plus"></i>Criar conta</div>
  <div class="g3" style="align-items:end">
    <div><label class="lbl">Usuário</label><input class="inp" id="newUserUsername" placeholder="ex: fulano"></div>
    <div><label class="lbl">Senha</label><input class="inp" id="newUserPassword" type="password" placeholder="mínimo 4 caracteres"></div>
    <button class="btn btn-p" onclick="createUser()"><i class="ti ti-plus"></i>Criar</button>
  </div>
  <div id="createUserError" style="display:none;color:var(--err);font-size:12px;margin-top:8px"></div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-users"></i>Contas existentes</div>
  ${AppState.isAdminUsersLoading ? '<div class="empty">Carregando...</div>' :
    !AppState.adminUsers.length ? '<div class="empty">Nenhuma conta encontrada.</div>' : `
  <table><thead><tr><th>Usuário</th><th>Tipo</th><th>Criada em</th></tr></thead><tbody>
  ${AppState.adminUsers.map(u => `<tr>
    <td>${u.username}</td>
    <td>${u.isAdmin ? '<span class="badge badge-acc">Admin</span>' : '<span class="badge badge-muted">Padrão</span>'}</td>
    <td>${formatDateTimeBR(u.createdAt)}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-trophy"></i>Itens do ranking</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Lista global — decide quais itens aparecem no Ranking pra todas as contas. Diferente da lista pessoal de "palavras rastreadas" (Cálculo de farme), que cada um configura pros próprios alertas.</div>
  ${!AppState.rankingItems.length ? '<div class="empty" style="padding:14px 0">Nenhum item no ranking ainda.</div>' : `
  <table style="margin-bottom:12px"><thead><tr><th>Item</th><th style="width:40px">Ações</th></tr></thead><tbody>
  ${AppState.rankingItems.map(word => `<tr>
    <td style="font-weight:500">${word}</td>
    <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeRankingItem('${word}')"><i class="ti ti-x"></i></button></td>
  </tr>`).join('')}
  </tbody></table>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Adicionar item</label><input class="inp" id="newRankingItem" placeholder="ex: Extensor Altíssimo"></div>
    <button class="btn btn-p" onclick="addRankingItem()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
</div>`;
}
