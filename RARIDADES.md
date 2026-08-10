# Como o FarmHub decide o que é "item raro"

Documento de referência do sistema de raridade — o que marca um item como raro, por que existem
dois caminhos, e quais números foram escolhidos (e com base em quê).

---

## Onde a raridade aparece

Marcar um item como raro tem efeito em quatro lugares:

| Onde | O que muda |
|---|---|
| **Sessões → Itens caindo agora** | Item raro sai em **roxo épico** e é **ordenado primeiro**, pra não se perder no meio do lixo comum |
| **Sessões → histórico expandido** | A linha do item raro fica roxa, com estrela |
| **Sessões → Farmando agora** | "Raros na mira" lista o que dá pra tirar naquela DG |
| **Visão geral → Raridades** | Histórico do que já veio + "há quanto tempo o que eu caço não cai" |
| **Sessão automática** | O palpite de qual DG você está farmando usa os itens raros que caíram |

---

## Os dois caminhos

Um item é considerado raro numa DG se **qualquer um** dos dois disser que sim. É união, não
interseção.

### 1. Cadastro manual — `Onde dropa`

Você digita o nome do item e marca em quais DGs ele cai. É curadoria: vale por cima de qualquer
estatística.

### 2. Detecção automática — pelo seu próprio histórico

Derivada das sessões já encerradas, sem cadastro nenhum. Usa **exatamente a mesma taxa** que a
página "Onde dropa" já exibe na coluna *"taxa por run"* — quantidade ÷ runs, em %:

```
(quantidade do item naquela DG ÷ total de runs naquela DG) × 100  ≤  P%
```

onde **P** é o limiar configurável (padrão **2%**). Só vale em DGs onde você já fez pelo menos
`100 / P` runs (no mínimo 50).

A unidade é % justamente pra bater com o que "Onde dropa" mostra: se lá aparece *"taxa por run:
4.2%"* e o seu limiar é 2%, dá pra saber na hora que aquele item **não** conta como raro, sem
converter nada de cabeça.

Equipamento genérico (`isExcludedGearItem`) fica de fora antes de qualquer conta — ver a seção
sobre isso mais abaixo.

Implementação: `getStatisticalRareItemNames()` em `js/features/item-dungeon-sources.js`.

---

## O limiar: como ajustar e por que ele é configurável

O critério é expresso em **% de chance por run** — a mesma unidade da coluna "taxa por run" de
"Onde dropa". Uma versão anterior usava "1 a cada N runs": é a mesma matemática, mas obrigava a
converter de cabeça pra comparar as duas telas.

**Ajuste na própria Visão geral**, no card Raridades: *"Considero raro o que cai em até ___% das
runs da DG"*. O valor fica salvo na sua conta (`AppState.rarityMaxPercent`).

### A amostra mínima é derivada, não escolhida

Pra afirmar que algo cai em menos de P% das runs, o item precisa ter tido **ao menos 100/P
chances** de cair naquela DG — antes disso, *"não caiu ainda"* não é evidência de raridade. Por
isso a amostra mínima acompanha o limiar automaticamente, em vez de ser um segundo número solto.

O piso é 50 runs, o mesmo que "Onde dropa" já usa pra considerar uma taxa confiável
(`MIN_RUNS_FOR_CONFIDENT_RATE`).

Sessões sem o campo "runs" preenchido não entram na conta (sem denominador, não há taxa).

### Por que o padrão é exigente (e por que já foi frouxo demais)

A primeira versão usava **1 a cada 7 runs** e o resultado, com dados reais, foram **4.565
"raridades"** — incluindo joias que caem 2× por dia.

A conta que explica: num ritmo de ~60 runs/dia, 1-a-cada-7 significa que qualquer item caindo
menos de ~8 vezes **por dia** era marcado como raro. Destacar o que cai todo dia é o mesmo que não
destacar nada.

| Frequência real | Taxa por run | Passava no limiar antigo (~14%)? | Passa no padrão atual (2%)? |
|---|---|---|---|
| 2× por dia | 3,3% | sim | não |
| 1× a cada 2 dias | 1,7% | sim | **sim** |
| 1× por semana | 0,24% | sim | **sim** |
| "mil DGs pra cair" | 0,1% | sim | **sim** |

### Como conferir se está calibrado

O bloco "O que você caça" (Visão geral → Raridades) mostra a **taxa real** de cada item
cadastrado, em % e na forma bruta (ex: `0.83% · 1/120 runs`). É por ali que dá pra ver se a % escolhida bate com a
realidade do servidor — e a regra prática está na própria tela: *se ainda vier coisa que cai todo
dia, baixe a %*.

---

## Equipamento genérico nunca entra

Armadura, elmo, luva, coturno, espada, manopla, máscara, chakram e afins (a lista completa é
`EXCLUDED_ITEM_KEYWORDS` em `js/features/drops.js`) são ignorados em todo o app — não têm valor de
venda e só inflariam as listas.

Esse filtro **precisa ser aplicado na leitura**, não só na gravação: sessões antigas — de antes do
filtro existir, ou de antes de uma palavra ter sido acrescentada à lista — ainda guardam esses
itens no registro. Uma versão da detecção de raridade lia `session.items` direto e, como cada
*variação* de peça cai pouco ("Manopla de Demonite", "Armadura de Paládio(GU)"...), todas passavam
em qualquer limiar e viravam "raridade".

Aplicado hoje em `getStatisticalRareItemNames()`, `getRareDropHistory()` e `sessionItemsRow()`.

---

## Por que manter o cadastro manual (o ponto cego da estatística)

Essa é a parte que não é óbvia.

**A detecção automática só enxerga item que já caiu.** Ela parte de `session.items`, que é um mapa
`nome → quantidade`. Um item que nunca caiu não tem quantidade zero ali — ele simplesmente **não
existe** no mapa. Não tem como ser avaliado.

Ou seja: quanto mais raro o item, menos a estatística consegue vê-lo. O item que você mais caça —
aquele que você ainda não tirou depois de centenas de runs — é exatamente o caso que ela **nunca**
vai detectar.

Verificado no código: 200 runs numa DG, item `Lendario` nunca caído → a detecção devolve só os
itens que já apareceram; `Lendario` fica de fora.

**O cadastro manual resolve isso**, e é o que faz o bloco "O que você caça" conseguir dizer *"ainda
não caiu pra você"*. Sem cadastro, esse item seria invisível pro sistema inteiro.

### Resumo prático

| Situação | Quem cobre |
|---|---|
| Item raro que já caiu algumas vezes | Detecção automática (sem trabalho nenhum) |
| Item raro que você ainda **não tirou** | Só o cadastro manual |
| DG nova, sem runs suficientes de histórico | Só o cadastro manual |
| Item que você quer marcar por decisão própria | Cadastro manual (vale por cima) |

**Recomendação:** deixe a detecção automática cuidar do dia a dia e cadastre à mão só os poucos
itens que você realmente está caçando e ainda não tirou. É pouco trabalho e é justamente o que a
automação não alcança.

---

## Arquivos

| Arquivo | Papel |
|---|---|
| `js/features/item-dungeon-sources.js` | Limiares, detecção estatística, união com o cadastro manual |
| `js/features/rare-drops.js` | Histórico de raridades e "há quanto tempo não cai" |
| `js/pages/overview-page.js` | Card **Raridades** |
| `js/pages/sessions-page.js` | Destaque roxo no histórico e em "Raros na mira" |
| `js/features/dg-session.js` | Destaque roxo + ordenação no bloco ao vivo |
| `css/styles.css` | Tokens `--epic`, `--epic-bg`, `--epic-border` |

Sobre a cor: o roxo clássico de "épico" (`#a855f7`) reprova em contraste no fundo escuro do tema
(4,0:1, abaixo do mínimo 4,5:1 do WCAG AA pra texto pequeno). O tom usado é `#c084fc`, que mantém
a leitura de raridade com 6,0:1.
