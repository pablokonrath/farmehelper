export function formatNumber(value) {
  return Math.round(value || 0).toLocaleString('pt-BR');
}

// Extrai apenas os dígitos de um valor digitado em campo mascarado (Alz sempre inteiro, sem centavos).
export function parseAlzInput(rawValue) {
  const digits = String(rawValue ?? '').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

// Escala de cores por faixa de valor em Alz (tons neon, pensados pro fundo escuro):
// < 1B laranja, 1B–9,9B ciano, 10B–99,9B verde neon, 100B+ magenta, negativo vermelho, zero cinza.
export function getAlzTierColor(value) {
  if (value < 0) return '#fb4570';
  if (value === 0 || !value) return 'var(--muted)';
  if (value >= 100_000_000_000) return '#f472b6';
  if (value >= 10_000_000_000) return '#4ade80';
  if (value >= 1_000_000_000) return '#38bdf8';
  return '#fb923c';
}

// Reformata um <input> de Alz a cada tecla digitada (ponto de milhar + cor de faixa), sem
// disparar nenhum setState/renderPage — só mexe no próprio elemento. Mesma lógica de
// maskDateInputBR: não tenta preservar a posição exata do cursor no meio de um texto já
// formatado (o padrão real de uso é sempre digitar do começo/fim, nunca editar no meio).
export function maskAlzInputLive(input) {
  const digits = input.value.replace(/\D/g, '');
  const value = digits ? parseInt(digits, 10) : 0;
  input.value = digits ? value.toLocaleString('pt-BR') : '';
  input.style.color = getAlzTierColor(value);
  return value;
}

function trimTrailingZeros(num) {
  return num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

// Notação de gíria de MMO brasileiro: k = mil, kk = milhão (mil de mil), bi = bilhão,
// T = trilhão. Só pra exibição — nunca usar isso pra preencher um campo editável, o valor
// exato mora em formatNumber()/parseAlzInput().
export function formatAlzGamer(value) {
  const num = Math.round(value || 0);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000_000) return sign + trimTrailingZeros(abs / 1_000_000_000_000) + 'T';
  if (abs >= 1_000_000_000) return sign + trimTrailingZeros(abs / 1_000_000_000) + 'bi';
  if (abs >= 1_000_000) return sign + trimTrailingZeros(abs / 1_000_000) + 'kk';
  if (abs >= 1_000) return sign + trimTrailingZeros(abs / 1_000) + 'k';
  return sign + abs.toLocaleString('pt-BR');
}

export function renderAlzValue(value, bold) {
  return `<span class="mono" style="color:${getAlzTierColor(value)};${bold ? 'font-weight:700;' : ''}" title="${formatNumber(value)} Alz">${formatAlzGamer(value)}</span>`;
}

export function getChartBarColor(value, alpha) {
  if (value >= 100e9) return `rgba(244,114,182,${alpha})`;
  if (value >= 10e9) return `rgba(74,222,128,${alpha})`;
  if (value >= 1e9) return `rgba(56,189,248,${alpha})`;
  return `rgba(251,146,60,${alpha})`;
}

export function formatDateBR(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function formatDateTimeBR(isoTimestamp) {
  return new Date(isoTimestamp).toLocaleString('pt-BR');
}

// O <input type="date"> nativo mostra DD/MM/AAAA ou MM/DD/AAAA dependendo do idioma do
// navegador/SO — não do "lang" da página — e não dá pra forçar isso. Por isso os campos de
// data do app usam texto mascarado em vez do input nativo, sempre convertendo pra ISO
// (AAAA-MM-DD) por baixo, que é o formato usado em todo o app pra comparar/ordenar datas.
export function formatDateInputBR(isoDate) {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  return `${day}/${month}/${year}`;
}

export function maskDateInputBR(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += '/' + digits.slice(2, 4);
  if (digits.length > 4) out += '/' + digits.slice(4, 8);
  return out;
}

export function parseDateInputBR(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 8) return '';
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);
  return `${year}-${month}-${day}`;
}
