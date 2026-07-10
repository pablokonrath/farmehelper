import { AppState } from '../state/app-state.js';
import { formatDateTimeBR, renderAlzValue } from '../utils/formatting.js';

const FLAG_TYPE_BADGES = {
  drop_spike: '<span class="badge badge-warn">Pico de drops</span>',
  file_tamper: '<span class="badge" style="background:var(--err-bg);color:var(--err);border:1px solid var(--err-border)">Arquivo editado</span>',
};

function renderIntegrityFlagsCard() {
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-shield-exclamation"></i>Alertas de integridade</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Sinalizações automáticas de possível dado forjado (arquivo editado manualmente ou pico de drops numa sincronização). É heurística, não prova de trapaça — revise caso a caso.</div>
  ${AppState.isIntegrityFlagsLoading ? '<div class="empty">Carregando...</div>' :
    !AppState.integrityFlags.length ? '<div class="empty" style="padding:14px 0">Nenhum alerta registrado.</div>' : `
  <table><thead><tr><th>Usuário</th><th style="width:120px">Tipo</th><th>Detalhe</th><th style="width:140px">Quando</th></tr></thead><tbody>
  ${AppState.integrityFlags.map(f => `<tr>
    <td>${f.username}</td>
    <td>${FLAG_TYPE_BADGES[f.type] || f.type}</td>
    <td style="font-size:12px">${f.details || ''}</td>
    <td style="font-size:12px;color:var(--muted)">${formatDateTimeBR(f.createdAt)}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}

function renderAdminActionLogCard() {
  return `
<div class="card">
  <div class="ctitle"><i class="ti ti-history"></i>Log de atividade</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Registro do que cada admin criou ou alterou.</div>
  ${AppState.isAdminActionLogLoading ? '<div class="empty">Carregando...</div>' :
    !AppState.adminActionLog.length ? '<div class="empty" style="padding:14px 0">Nenhuma ação registrada ainda.</div>' : `
  <table><thead><tr><th style="width:120px">Admin</th><th>Ação</th><th style="width:140px">Quando</th></tr></thead><tbody>
  ${AppState.adminActionLog.map(a => `<tr>
    <td style="font-weight:500">${a.adminUsername}</td>
    <td style="font-size:12px">${a.details || a.action}</td>
    <td style="font-size:12px;color:var(--muted)">${formatDateTimeBR(a.createdAt)}</td>
  </tr>`).join('')}
  </tbody></table>`}
</div>`;
}

export function renderAdminPage() {
  return `
<div class="pg-title"><i class="ti ti-shield-lock"></i>Admin</div>
<div class="pg-sub">Crie contas pra outras pessoas da guild usarem o DropList.</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-user-plus"></i>Criar conta</div>
  <div class="g3" style="align-items:end;margin-bottom:10px">
    <div><label class="lbl">Usuário</label><input class="inp" id="newUserUsername" placeholder="ex: fulano"></div>
    <div><label class="lbl">Senha</label><input class="inp" id="newUserPassword" type="password" placeholder="mínimo 4 caracteres"></div>
    <div><label class="lbl">Guild</label>
      <select class="inp" id="newUserGuild">
        <option value="">Sem guild</option>
        ${AppState.guilds.map(g => `<option value="${g}">${g}</option>`).join('')}
      </select>
    </div>
  </div>
  <div style="display:flex;align-items:center;gap:16px">
    <div style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" id="newUserIsAdmin" style="width:16px;height:16px;accent-color:var(--acc)">
      <label for="newUserIsAdmin" style="font-size:12px;cursor:pointer">Admin/Líder</label>
    </div>
    <button class="btn btn-p" onclick="createUser()"><i class="ti ti-plus"></i>Criar</button>
  </div>
  <div id="createUserError" style="display:none;color:var(--err);font-size:12px;margin-top:8px"></div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-shield"></i>Guilds</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Lista global de guilds (texto controlado, evita nomes duplicados escritos diferente).</div>
  ${!AppState.guilds.length ? '<div class="empty" style="padding:14px 0">Nenhuma guild cadastrada ainda.</div>' : `
  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
  ${AppState.guilds.map(name => `<span class="badge badge-acc" style="display:flex;align-items:center;gap:6px">${name}<button style="background:transparent;border:none;color:inherit;cursor:pointer;font-size:12px;padding:0;display:flex" onclick="removeGuild('${name}')"><i class="ti ti-x"></i></button></span>`).join('')}
  </div>`}
  <div class="row">
    <div style="flex:1"><label class="lbl">Nova guild</label><input class="inp" id="newGuild" placeholder="ex: Elysium"></div>
    <button class="btn btn-p" onclick="addGuild()"><i class="ti ti-plus"></i>Adicionar</button>
  </div>
</div>

<div class="card">
  <div class="ctitle"><i class="ti ti-users"></i>Contas existentes</div>
  ${AppState.isAdminUsersLoading ? '<div class="empty">Carregando...</div>' :
    !AppState.adminUsers.length ? '<div class="empty">Nenhuma conta encontrada.</div>' : `
  <table><thead><tr><th>Usuário</th><th>Tipo</th><th style="width:160px">Guild</th><th>Criada em</th>${AppState.isMasterAdmin ? '<th style="width:40px">Ações</th>' : ''}</tr></thead><tbody>
  ${AppState.adminUsers.map(u => {
    // Ninguém além do próprio admin mestre mexe na conta dele — mostra como texto simples
    // pra quem não é mestre, em vez de um controle que o servidor vai rejeitar com 403.
    const lockedForViewer = u.isMasterAdmin && !AppState.isMasterAdmin;
    const typeCell = u.isMasterAdmin
      ? '<span class="badge badge-warn">Admin mestre</span>'
      : lockedForViewer
      ? (u.isAdmin ? 'Admin' : 'Padrão')
      : `<button class="btn btn-xs ${u.isAdmin ? 'btn-p' : 'btn-d'}" onclick="toggleUserAdmin(${u.id}, ${u.isAdmin})">${u.isAdmin ? 'Admin' : 'Padrão'}</button>`;
    const guildCell = lockedForViewer
      ? (u.guild || 'Sem guild')
      : `<select class="inp inp-sm" onchange="setUserGuild(${u.id}, this.value)">
      <option value="">Sem guild</option>
      ${AppState.guilds.map(g => `<option value="${g}"${u.guild === g ? ' selected' : ''}>${g}</option>`).join('')}
    </select>`;
    return `<tr>
    <td>${u.username}</td>
    <td>${typeCell}</td>
    <td>${guildCell}</td>
    <td>${formatDateTimeBR(u.createdAt)}</td>
    ${AppState.isMasterAdmin ? `<td>${u.username === AppState.currentUsername ? '' : `<button style="background:transparent;border:none;color:var(--err);cursor:pointer;font-size:14px" onclick="deleteUser(${u.id}, '${u.username}')" title="Excluir conta"><i class="ti ti-trash"></i></button>`}</td>` : ''}
  </tr>`;
  }).join('')}
  </tbody></table>`}
</div>

${AppState.isMasterAdmin ? `
<div class="card">
  <div class="ctitle"><i class="ti ti-user-cog"></i>Editar login (admin mestre)</div>
  <div style="font-size:12px;color:var(--muted);margin-bottom:10px">Só você pode trocar o usuário/senha de qualquer conta.</div>
  <div class="g3" style="align-items:end;margin-bottom:10px">
    <div><label class="lbl">Conta</label>
      <select class="inp" id="editLoginUserId" onchange="prefillEditLoginUsername(this.value)">
        <option value="">Selecione...</option>
        ${AppState.adminUsers.map(u => `<option value="${u.id}">${u.username}</option>`).join('')}
      </select>
    </div>
    <div><label class="lbl">Novo usuário</label><input class="inp" id="editLoginUsername" placeholder="usuário atual"></div>
    <div><label class="lbl">Nova senha</label><input class="inp" id="editLoginPassword" type="password" placeholder="deixe em branco pra não mudar"></div>
  </div>
  <button class="btn btn-p" onclick="saveEditedLogin()"><i class="ti ti-device-floppy"></i>Salvar</button>
  <div id="editLoginError" style="display:none;color:var(--err);font-size:12px;margin-top:8px"></div>
</div>` : ''}

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
</div>

${renderIntegrityFlagsCard()}

${renderAdminActionLogCard()}`;
}
