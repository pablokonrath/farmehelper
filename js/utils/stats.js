// Estatística de taxa de drop.
//
// Uma taxa medida ("caiu 3 vezes em 72 runs = 4,2%") não é a taxa VERDADEIRA do item — é uma
// estimativa, e com poucas ocorrências ela é péssima. Com 1 drop observado a taxa real pode estar
// entre 1/179 e 1/40.000; com 30 drops, a faixa aperta pra algo utilizável. O que dá precisão é
// quantos DROPS você já viu, não quantas runs fez — e a incerteza cai com a raiz quadrada, então
// pra dobrar a precisão é preciso 4x mais ocorrências.
//
// Estas funções existem pra o app poder mostrar essa incerteza em vez de exibir um número seco
// como se fosse fato.

// Limite superior do intervalo de confiança 95% pra uma contagem de Poisson (aproximação de Byar,
// exata o bastante: bate com a tabela exata na 3ª casa já a partir de k=1).
export function poissonUpper95(k) {
  if (k < 0) return 0;
  const n = k + 1;
  return n * Math.pow(1 - 1 / (9 * n) + 1.96 / (3 * Math.sqrt(n)), 3);
}

// Limite inferior (Byar). k=0 não tem limite inferior útil — devolve 0.
export function poissonLower95(k) {
  if (k <= 0) return 0;
  return k * Math.pow(1 - 1 / (9 * k) - 1.96 / (3 * Math.sqrt(k)), 3);
}

// Faixa provável (95%) da taxa real de um item, a partir de k drops em n runs.
// Devolve frações por run — { estimada, min, max } — ou null sem runs.
export function dropRateRange(qty, runs) {
  if (!runs || runs <= 0) return null;
  return {
    estimada: qty / runs,
    min: Math.max(0, poissonLower95(qty) / runs),
    max: poissonUpper95(qty) / runs,
  };
}

// Quantas unidades esperar numa leva de N runs — de 0 a quanto, não um número só.
//
// É uma pergunta DIFERENTE da que dropRateRange responde. Aquela mede a incerteza sobre a taxa
// verdadeira ("a taxa real está entre 2,3% e 8,7%"). Esta mede a variação natural do resultado
// mesmo com a taxa perfeitamente conhecida: com 4,7% por run, 20 runs dão em média ~1 unidade,
// mas sair 0 é comum e sair 3 também. As duas incertezas existem e não são a mesma.
//
// Sem isso, "≈1 a cada 21 runs" se lê como agenda — como se na run 21 fosse cair. Não é: é média
// de longo prazo, e não descreve nada sobre as próximas 20 runs.
//
// Poisson exata por soma acumulada, faixa central de 90%. λ aqui é sempre pequeno (poucas
// unidades por leva), então somar termo a termo é barato e dispensa aproximação.
export function expectedCountRange(ratePerRun, runs) {
  const lambda = ratePerRun * runs;
  if (!(lambda > 0)) return null;

  let pmf = Math.exp(-lambda);
  let cdf = pmf;
  let min = cdf >= 0.05 ? 0 : null;
  let k = 0;
  while (k < 1000 && cdf < 0.95) {
    k++;
    pmf *= lambda / k;
    cdf += pmf;
    if (min === null && cdf >= 0.05) min = k;
  }
  return { min: min ?? 0, max: k, media: lambda };
}

// Quão confiável é a estimativa, pelo nº de OCORRÊNCIAS (não de runs) — é isso que manda na
// precisão. Os cortes seguem a faixa que cada quantidade produz: com <3 drops a faixa é larga
// demais pra afirmar qualquer coisa; a partir de ~10 já dá pra confiar na ordem de grandeza.
export function rateConfidence(qty) {
  if (qty >= 10) return { nivel: 'boa', rotulo: 'estimativa firme' };
  if (qty >= 3) return { nivel: 'media', rotulo: 'estimativa aproximada' };
  return { nivel: 'baixa', rotulo: 'poucos drops — número ainda fraco' };
}
