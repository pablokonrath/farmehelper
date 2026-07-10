import { AppState } from '../state/app-state.js';
import { formatDateTimeBR, renderAlzValue } from '../utils/formatting.js';

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
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Lista global — decide quais itens aparecem no Ranking pra todas as contas. Diferente da lista pessoal de "palavras rastreadas" (Cálculo de farme), que cada um configura pros próprios alertas. Itens em destaque ficam fixados no topo do Ranking, com visual diferenciado.</div>
  ${!AppState.rankingItems.length ? '<div class="empty" style="padding:14px 0">Nenhum item no ranking ainda.</div>' : `
  <table style="margin-bottom:12px"><thead><tr><th>Item</th><th style="width:90px">Destaque</th><th style="width:40px">Ações</th></tr></thead><tbody>
  ${AppState.rankingItems.map(r => `<tr>
    <td style="font-weight:500">${r.word}</td>
    <td><button style="background:transparent;border:none;cursor:pointer;font-size:16px;color:${r.featured ? 'var(--gold)' : 'var(--muted)'}" onclick="toggleRankingItemFeatured('${r.word}')" title="Alternar destaque"><i class="ti ti-star${r.featured ? '-filled' : ''}"></i></button></td>
    <td><button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="removeRankingItem('${r.word}')"><i class="ti ti-x"></i></button></td>
  </tr>`).join('')}
  </tbody></table>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Adicionar item</label><input class="inp" id="newRankingItem" placeholder="ex: Extensor Altíssimo"></div>
    <div style="display:flex;align-items:center;gap:6px;padding-bottom:7px"><input type="checkbox" id="newRankingItemFeatured" style="width:16px;height:16px;accent-color:var(--gold)"><label for="newRankingItemFeatured" style="font-size:12px;cursor:pointer">Destaque</label></div>
    <button class="btn btn-p" onclick="addRankingItem()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-category"></i>Categorias de item</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Lista global de categorias (ex: Sets, Armas, Dragonas) usada pra organizar o Relatório.</div>
  ${!AppState.itemCategories.length ? '<div class="empty" style="padding:14px 0">Nenhuma categoria criada ainda.</div>' : `
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
  ${AppState.itemCategories.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${name}<button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeItemCategory('${name}')"><i class="ti ti-x"></i></button></span>`).join('')}
  </div>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Nova categoria</label><input class="inp" id="newItemCategory" placeholder="ex: Sets"></div>
    <button class="btn btn-p" onclick="addItemCategory()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-tags"></i>Atribuir categorias aos itens</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Escolhe a categoria de cada item com preço cadastrado (Cálculo de farme). Item sem categoria aparece como "Sem categoria" no Relatório.</div>
  ${!Object.keys(AppState.itemPrices).length ? '<div class="empty" style="padding:14px 0">Nenhum item com preço cadastrado ainda.</div>' : `
  <table><thead><tr><th>Item</th><th>Valor</th><th style="width:180px">Categoria</th></tr></thead><tbody>
  ${Object.entries(AppState.itemPrices).sort(([a], [b]) => a.localeCompare(b)).map(([name, price]) => `<tr>
    <td>${name}</td>
    <td>${renderAlzValue(price)}</td>
    <td><select class="inp inp-sm" onchange="setItemCategoryAssignment('${name}', this.value)">
      <option value="">Sem categoria</option>
      ${AppState.itemCategories.map(cat => `<option value="${cat}"${AppState.itemCategoryAssignments[name] === cat ? ' selected' : ''}>${cat}</option>`).join('')}
    </select></td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}
