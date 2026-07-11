import { AppState } from '../state/app-state.js';
import { playThemedSound } from './alerts.js';
import { renderPage } from '../router.js';

const API_BASE = 'api';

export async function loadAlertSounds() {
  try {
    const response = await fetch(`${API_BASE}/alert-sounds.php`, { credentials: 'same-origin' });
    AppState.alertSounds = response.ok ? await response.json() : {};
  } catch {
    AppState.alertSounds = {};
  }
  renderPage();
}

export async function uploadAlertSound(alertType) {
  const input = document.getElementById('soundFile-' + alertType);
  const errorEl = document.getElementById('soundError-' + alertType);
  if (errorEl) errorEl.style.display = 'none';

  const file = input?.files?.[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('alertType', alertType);
  formData.append('sound', file);

  try {
    const response = await fetch(`${API_BASE}/upload-alert-sound.php`, {
      method: 'POST',
      credentials: 'same-origin',
      body: formData,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (errorEl) {
        errorEl.textContent = data.message || 'Erro ao enviar o arquivo.';
        errorEl.style.display = 'block';
      }
      return;
    }
    if (input) input.value = '';
    await loadAlertSounds();
  } catch {
    if (errorEl) {
      errorEl.textContent = 'Erro de conexão com o servidor.';
      errorEl.style.display = 'block';
    }
  }
}

export async function removeAlertSound(alertType) {
  if (!confirm('Remover o som customizado e voltar pro bipe padrão?')) return;
  try {
    const response = await fetch(`${API_BASE}/upload-alert-sound.php`, {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ alertType }),
    });
    if (!response.ok) console.error('Falha ao remover som:', response.status, await response.text());
    await loadAlertSounds();
  } catch (err) {
    console.error('Erro de conexão ao remover som:', err);
  }
}

export function setAlertSoundVolume(alertType, value) {
  const volume = Math.max(0, Math.min(1, +value));
  if (!AppState.alertSounds[alertType]) AppState.alertSounds[alertType] = { filename: null, volume };
  else AppState.alertSounds[alertType].volume = volume;
  const label = document.getElementById('soundVolumeLabel-' + alertType);
  if (label) label.textContent = Math.round(volume * 100) + '%';

  fetch(`${API_BASE}/alert-sounds.php`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ alertType, volume }),
  }).then(response => {
    if (!response.ok) console.error('Falha ao salvar volume do alerta:', response.status);
  }).catch(err => console.error('Erro de conexão ao salvar volume do alerta:', err));
}

export function testAlertSound(alertType) {
  const volume = AppState.alertSounds?.[alertType]?.volume ?? 0.9;
  playThemedSound(alertType, volume);
}
