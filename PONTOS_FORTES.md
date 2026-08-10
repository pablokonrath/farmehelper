# Pontos fortes do FarmHub — material bruto pra copy da tela de login

Isto não é um changelog. É a lista dos argumentos reais (sem exagero, só o que o sistema
de fato faz hoje) organizados por tema, pra puxar frases prontas na hora de escrever a
tela de login. Cada bloco tem: a virada de chave (o que muda pra quem usa) + os recursos
concretos que sustentam ela.

---

## 1. Não é uma planilha de registro — é uma ferramenta de decisão

A diferença central do FarmHub pra "só anotar o que caiu": ele cruza os dados que você já
gera sozinho pra te dizer **onde vale a pena gastar o seu tempo e suas entradas limitadas**,
não só mostrar números depois que o dia já acabou.

- **Qual DG rende mais** — ranking por Alz/run (não Alz/hora — DG tem limite diário de
  entradas, então o que importa é o rendimento por entrada), com tempo/run real de cada uma.
- **Vale a pena resetar essa DG?** — calcula se o líquido por run cobre o custo do reset em
  gemas, e agora **avisa isso antes de gastar** — direto no carrinho, no momento em que você
  marca "usou reset", não só numa página separada que você precisa lembrar de conferir.
- **Qual rota rende mais** — comparação por Lucro/hora (não lucro bruto — uma rota mais longa
  pode não ser a melhor forma de gastar seu tempo), com o motivo aparecendo no tooltip.
- **Quanto tempo você tem hoje?** — você diz quantas horas tem, o sistema monta a combinação
  de rota salva + DGs avulsas que mais rende nesse tempo, sem deixar sobra sem uso.
- **Progresso do rush de hoje** — não é só "quantas runs já fiz", mostra também **Alz esperado
  (pelo seu histórico) x Alz já realizado**, pra saber se o dia tá rendendo o que o plano previa.
- **Sugestão de créditos de macro** — cruza a dificuldade de cada DG do carrinho com o
  tempo/run real e sugere quantos créditos comprar de cada faixa, em vez de fazer de cabeça.

## 2. Histórico de verdade, não um recorte de 30 dias

O log do próprio jogo só guarda um mês. O FarmHub guarda tudo que você já farmou desde que
começou a usar, num banco de dados de verdade — sem limite artificial apagando sessões
antigas por trás dos panos.

- **Os drops em si** ficam arquivados por dia e por item, então "quanto eu farmei" continua
  verdade em qualquer período, mesmo depois do log do jogo ter descartado aquele mês. E quando
  um período pedido é antigo demais até pro arquivo, o app **avisa** em vez de mostrar um total
  menor em silêncio.
- Sessões de farme por DG (runs, tempo ativo, Alz, itens) ficam salvas indefinidamente.
- A média de Alz/run e Alz/hora de cada DG fica cada vez mais confiável com o tempo, em vez
  de resetar toda vez que o log local expira.
- Preço de venda real de cada item, dia a dia — não o preço que você cadastrou como estimativa,
  o que você **de fato conseguiu vender por**.

## 2b. Não depende de você lembrar de marcar

Esquecer de apertar "Iniciar" antes de entrar na DG era o maior buraco no histórico: o farme
acontecia, mas ficava fora de qualquer sessão — e é a sessão que alimenta "Qual DG rende mais",
tempo por run e "Onde dropa". Agora, quando os drops começam a cair sem sessão aberta, o FarmHub
abre uma sozinho e **retroage o início pro primeiro drop**, sem perder os minutos iniciais. Ele
até tenta adivinhar qual DG é pelos itens que caíram; se errar, trocar é um clique. E o seletor
de DG já mostra no topo o que ainda falta do rush que você planejou pro dia.

## 3. Você decide o que é ruído — e o sistema respeita

Itens de equipamento genérico (armadura, elmo, luva, coturno, espada, orb, disco...) não têm
valor e só poluem a lista do que caiu em cada DG. O FarmHub filtra esses itens em todo canto —
na visão geral, no histórico de sessão, na taxa de farme do dia — de forma consistente, então
a lista do que importa fica curta e a média de farme não é distorcida por lixo sem preço.

## 4. Modo guiado — pra quem não quer aprender o sistema pra usar o sistema

Um assistente passo a passo (uma pergunta por tela, botão grande) cobre as ações mais comuns
sem precisar caçar em qual página cada coisa fica: registrar venda, definir meta do dia,
iniciar/encerrar sessão de DG, rastrear item pra alerta, montar o rush do dia, aplicar uma
rota salva, criar um cofre de Alz, recuperar uma sessão que esqueceu de marcar. Pensado pra
quem é leigo, tem pressa, ou só não quer decorar onde cada botão fica. O menu lateral em si
também é organizado por frequência de uso (o que se mexe todo dia x configuração ocasional),
não uma lista plana — e cada card que antes despejava um parágrafo de explicação agora esconde
esse texto atrás de um "Como funciona", pra a tela mostrar o número primeiro, não o manual.

## 5. Metas com dinheiro real, não estimativa

- **Meta do dia** — quanto de Alz farmar hoje, acompanhado ao vivo pelo log.
- **Cofres de Alz (vendas)** — reserva uma % fixa de cada venda registrada pra um objetivo
  (ex: "30% de tudo que eu vender vai pro set novo"), com progresso visível e aviso de quanto
  das vendas de hoje já caiu em cada cofre. Nome separado de propósito de "Meta do dia" —
  são dois totais sem relação (um é farmado, o outro é vendido de verdade), então não competem.
- **Gráfico de preço de venda** — mostra por quanto você realmente vendeu cada item ao longo
  do tempo, pra decidir a melhor hora de vender — não o preço que você cadastrou como meta.
- **Aviso de preço esquecido** — sinaliza quando um item cadastrado passa de 2 semanas sem
  ter o preço revisto, porque economia de servidor privado varia e uma estimativa velha vira
  errada silenciosamente se ninguém for lembrado de checar.

## 6. Alertas que funcionam mesmo longe da tela

- Som + pop-up + notificação do sistema operacional quando um item rastreado cai — mesmo com
  o navegador minimizado (o monitoramento roda em segundo plano via Web Worker).
- Vigilância de travamento (watchdog): se o farme parar sozinho e nada mais cair, o sistema
  percebe e avisa.
- Telegram (opcional): recebe os mesmos avisos direto no celular, mesmo com o navegador
  fechado — inclui comandos (`/drop`, `/farm`, `/sessao`) pra consultar sem abrir o site.

## 7. Cada conta é só sua

Sem dado cruzado entre jogadores, sem conta compartilhada — preços, sessões, alertas e
histórico de cada conta são isolados. Criar conta só pede usuário e senha, nenhum dado
pessoal.

## 7b. Item raro tem lugar próprio

O farme do dia a dia é volume; o que a gente lembra (e caça) são os drops raros — e eles se
perdem no meio de milhares de itens comuns.

- Quando um raro cai, ele sai em **roxo** e vem **primeiro** na lista da sessão ao vivo.
- A Visão geral tem uma área **Raridades**: o histórico de tudo de bom que já veio (com DG, valor
  e há quanto tempo) e, embaixo, **o que você caça** — as raridades que você marcou, com a última
  vez que caíram e a taxa real (ex: 1 a cada 120 runs). O que nunca caiu aparece marcado.
- Você não precisa cadastrar nada pra começar: o sistema deduz o que é raro pelo seu próprio
  histórico (o que cai em poucas runs daquela DG). Cadastrar à mão continua valendo pros itens que
  você ainda **não tirou** — esses a estatística não tem como enxergar.

## 8. Não é só planilha — também te mostra quando você tá indo bem

- **Seu horário mais produtivo** — cruza todas as suas sessões pela hora em que começaram e
  mostra em que faixa do dia seu Alz/hora historicamente é maior, pra quem tem horário livre
  pra escolher quando jogar.
- **Recorde pessoal** — melhor dia e melhor sessão única já farmados, sempre visível na Visão
  geral. Não ajuda a decidir nada, é só o "high score" — motivação de jogador, não de planilha.

---

## Notas pra quem for escrever a copy final

- **"Código aberto"** é um argumento de confiança forte (já usado no README), mas só entra na
  tela de login se o repositório no GitHub estiver de fato público no momento — confirmar antes
  de prometer isso na tela.
- Evitar prometer números específicos (ex: "aumenta seu farme em X%") — nada disso é medido
  de verdade, o sistema não faz esse tipo de alegação sobre si mesmo.
- O tom do resto do produto é direto e sem enrolação ("registre, calcule, decida"), não hype de
  marketing — a copy da tela de login rende mais forte se seguir esse mesmo tom.
