import { formatDateInputBR } from './formatting.js';

// Input de data em texto mascarado (DD/MM/AAAA) em vez do <input type="date"> nativo — ver
// formatDateInputBR/maskDateInputBR/parseDateInputBR em formatting.js pro motivo. Guarda o
// valor internamente sempre em ISO; onChange (se informado) recebe o valor já convertido.
export function renderDateInputBR({ id = '', value = '', onChange = '', placeholder = 'DD/MM/AAAA' } = {}) {
  const idAttr = id ? `id="${id}" ` : '';
  const onChangeAttr = onChange ? `onchange="${onChange}(parseDateInputBR(this.value))" ` : '';
  return `<input class="inp" ${idAttr}type="text" inputmode="numeric" placeholder="${placeholder}" value="${formatDateInputBR(value)}" onfocus="this.value = this.value.replace(/\D/g,'')" oninput="this.value = maskDateInputBR(this.value)" ${onChangeAttr}>`;
}
