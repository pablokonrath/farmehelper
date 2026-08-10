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

Derivada das sessões já encerradas, sem cadastro nenhum:

```
quantidade total do item naquela DG ÷ total de runs naquela DG  ≤  0,15
```

com no mínimo **30 runs** de amostra na DG.

Implementação: `getStatisticalRareItemNames()` em `js/features/item-dungeon-sources.js`.

---

## De onde vieram os números

Sendo direto: os dois limiares foram escolhidos por **raciocínio, não medindo dados reais de
jogo**. O critério de cada um:

**`RARE_MAX_DROPS_PER_RUN = 0,15`** — equivale a "cai no máximo 1 vez a cada ~7 runs". Acima
disso o item aparece com frequência suficiente pra ser rotina, não raridade — destacar tudo é o
mesmo que não destacar nada.

**`MIN_RUNS_TO_JUDGE_RARITY = 30`** — com poucas runs, *todo* item parece raro só por ainda não
ter caído. 30 runs é o piso onde uma taxa de ~1/7 já teria tido chance real de aparecer algumas
vezes. Sessões sem o campo "runs" preenchido não entram na conta.

**Se algum dos dois estiver calibrado errado pro seu servidor**, os dois são constantes exportadas
no topo de `js/features/item-dungeon-sources.js` — mudar é uma linha, e o texto explicativo na
Visão geral se atualiza sozinho a partir delas.

Como conferir na prática: o bloco "O que você caça" (Visão geral → Raridades) mostra a taxa real
de cada item cadastrado, no formato `1/120 runs`. É por ali que dá pra ver se o limiar bate com a
realidade do servidor.

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
| DG nova, sem 30 runs de histórico | Só o cadastro manual |
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
