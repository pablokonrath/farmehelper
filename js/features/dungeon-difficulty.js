import { normalizeForSearch } from '../utils/parsing.js';
import { esc } from '../utils/escape.js';

// Classificação de dificuldade do helper (macro) — cada faixa tem um custo de crédito diferente
// (ver CREDIT_CATEGORIES em app-state.js: Iniciante/Intermediário/Avançado). Por nome, não por id,
// porque o catálogo de DGs é editável (admin pode adicionar DG customizada com id arbitrário) —
// isso também deixa robusto a rename leve, já que casa sem acento/maiúscula (normalizeForSearch).
// DG sem correspondência aqui cai em Iniciante, igual regra combinada com o jogador: "resto é iniciante".
const DUNGEON_DIFFICULTY_TIERS = [
  {
    id: 'avancado',
    label: 'Avançadas',
    names: [
      'Cidade Abandonada', 'Tumba Ancestral', 'Solo Flamejante', 'Ilha da Miragem',
      'Templo Esquecido 3SS', 'Desfiladeiro Congelado', 'Terminus Machina', 'Celestia',
    ],
  },
  {
    id: 'intermediario',
    label: 'Intermediárias',
    names: [
      'Templo Esquecido 2SS', 'Siena 2SS', 'Posto das Máquinas', 'Torre dos Mortos 3SS',
      'Templo Esquecido 2SS (Desperto)', 'Vale Tempestuoso (Desperto)', 'Torre dos Mortos 3SS (Parte 2)',
      'Crista Ilusória', 'Arena Acheron', 'Torre Diabólica (Parte 2)', 'Torre Diabólica', 'Keldrasil Sagrado',
    ],
  },
];
const INICIANTE_TIER = { id: 'iniciante', label: 'Iniciante' };

const tierByNormalizedName = new Map();
DUNGEON_DIFFICULTY_TIERS.forEach(tier => {
  tier.names.forEach(name => tierByNormalizedName.set(normalizeForSearch(name), tier));
});

export function getDungeonDifficulty(dungeonName) {
  return tierByNormalizedName.get(normalizeForSearch(dungeonName || '')) || INICIANTE_TIER;
}

// Agrupa a lista de DGs por dificuldade, na mesma ordem que o jogador listou (Avançadas →
// Intermediárias → Iniciante) — usado pra montar <optgroup> nos seletores de DG, já que o custo
// do helper muda por faixa. Só devolve grupos com pelo menos 1 DG.
export function groupDungeonsByDifficulty(dungeonList) {
  const groups = [...DUNGEON_DIFFICULTY_TIERS, INICIANTE_TIER].map(t => ({ id: t.id, label: t.label, dungeons: [] }));
  const groupById = {};
  groups.forEach(g => { groupById[g.id] = g; });
  dungeonList.forEach(dg => {
    groupById[getDungeonDifficulty(dg.name).id].dungeons.push(dg);
  });
  return groups.filter(g => g.dungeons.length);
}

// Monta as <option>/<optgroup> de um <select> de DG agrupado por dificuldade — reaproveitado nos
// seletores de "adicionar ao rush", "farmando agora" e afins, cada um com seu próprio texto de
// rótulo (labelFn) mas a mesma divisão por faixa de custo do helper.
export function renderDungeonOptionsGrouped(dungeonList, labelFn = dg => dg.name, selectedId = null) {
  const groups = groupDungeonsByDifficulty(dungeonList);
  const optionHtml = d => `<option value="${esc(d.id)}"${d.id === selectedId ? ' selected' : ''}>${esc(labelFn(d))}</option>`;
  // Só 1 grupo (ex: lista customizada toda "iniciante") -> lista plana, sem optgroup à toa.
  if (groups.length <= 1) return dungeonList.map(optionHtml).join('');
  return groups.map(g => `<optgroup label="${esc(g.label)}">${g.dungeons.map(optionHtml).join('')}</optgroup>`).join('');
}
