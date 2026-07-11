import { AppState } from '../state/app-state.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadGuildPanelData() {
  AppState.isGuildPanelLoading = true;
  renderPage();
  try {
    const params = new URLSearchParams();
    params.set('period', AppState.guildPanelPeriod || 'today');
    // Só o master admin pode olhar outra guild; pro resto o servidor ignora e usa a própria.
    if (AppState.isMasterAdmin && AppState.guildPanelGuild) params.set('guild', AppState.guildPanelGuild);
    const response = await fetch(`${API_BASE}/guild-panel.php?${params}`, { credentials: 'same-origin' });
    AppState.guildPanelData = response.ok ? await response.json() : null;
  } catch {
    AppState.guildPanelData = null;
  }
  AppState.isGuildPanelLoading = false;
  renderPage();
}

export function setGuildPanelPeriod(period) {
  AppState.guildPanelPeriod = period;
  loadGuildPanelData();
}

export function setGuildPanelGuild(guild) {
  AppState.guildPanelGuild = guild;
  loadGuildPanelData();
}
