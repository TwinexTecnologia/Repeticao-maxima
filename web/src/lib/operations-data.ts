export type OperationalMetric = {
  label: string;
  value: string;
  detail: string;
};

export type OperationalAlert = {
  title: string;
  detail: string;
  level: "alto" | "medio" | "baixo";
};

export type DebtRow = {
  title: string;
  category: string;
  dueDate: string;
  amount: string;
  status: string;
  impact: string;
};

export type StockRow = {
  sku: string;
  color: string;
  size: string;
  total: string;
  printed: string;
  reserved: string;
  free: string;
  coverage: string;
  reorderPoint: string;
  action: string;
};

export type ArtRow = {
  art: string;
  type: string;
  dtfAvailable: string;
  averageOutput: string;
  estimatedCoverage: string;
  costRule: string;
  action: string;
};

export type ProjectionRow = {
  title: string;
  value: string;
  detail: string;
};

export const operationPulseMetrics: OperationalMetric[] = [
  {
    label: "Caixa liquido projetado",
    value: "R$ 8.940",
    detail: "Sobra prevista apos pagar fabrica, cartao e brindes do mes",
  },
  {
    label: "Estoque total de camisetas",
    value: "146",
    detail: "Pretas, brancas e roxas prontas para vender ou estampar",
  },
  {
    label: "Estoque de artes / DTF",
    value: "27",
    detail: "Saldo somado das artes que ainda podem sair sem nova compra",
  },
  {
    label: "Nova recompra estimada",
    value: "Em 11 dias",
    detail: "Prazo calculado pelo giro atual e pelo lead time da fabrica",
  },
];

export const operationAlerts: OperationalAlert[] = [
  {
    title: "Parcela da fabrica vence antes do ritmo atual cobrir com folga",
    detail:
      "Se a media diaria cair, o caixa aperta perto do vencimento de 30 dias.",
    level: "alto",
  },
  {
    title: "Camiseta preta M sustenta so mais 9 dias de saida",
    detail:
      "Esse tamanho esta puxando o giro da semana e merece recompra antes do restante.",
    level: "alto",
  },
  {
    title: "Arte RM Basic precisa de nova rodada de DTF",
    detail:
      "Voce mandou 5 unidades e ja sairam 4; faltando 1 a fila de producao trava.",
    level: "medio",
  },
  {
    title: "Minimalistas seguram mais caixa que as full no mesmo preco",
    detail:
      "O custo de R$ 32 deixa mais folga que o modelo full de R$ 52.",
    level: "baixo",
  },
];

export const upcomingDebtMetrics: OperationalMetric[] = [
  {
    label: "Total a pagar",
    value: "R$ 7.850",
    detail: "Fabrica, cartao e acoes com influenciadores ainda abertas",
  },
  {
    label: "Entrada liquida esperada",
    value: "R$ 12.430",
    detail: "Projecao com base no liquido real da Nuvem Shop e da media atual",
  },
  {
    label: "Folga prevista",
    value: "R$ 4.580",
    detail: "Espaco esperado depois de quitar as obrigacoes do ciclo atual",
  },
];

export const debtRows: DebtRow[] = [
  {
    title: "Pedido atual da fabrica",
    category: "Fornecedor",
    dueDate: "15 dias",
    amount: "R$ 2.000",
    status: "Aberto",
    impact: "Precisa de giro normal para pagar com tranquilidade",
  },
  {
    title: "Pedido atual da fabrica",
    category: "Fornecedor",
    dueDate: "30 dias",
    amount: "R$ 2.000",
    status: "Aberto",
    impact: "Ja depende de manter volume da Nuvem Shop",
  },
  {
    title: "Pedido atual da fabrica",
    category: "Fornecedor",
    dueDate: "45 dias",
    amount: "R$ 1.000",
    status: "Aberto",
    impact: "Deve ser coberto com o giro do lote atual se a media continuar",
  },
  {
    title: "Campanha com influenciadores",
    category: "Brindes",
    dueDate: "Uso imediato",
    amount: "R$ 416",
    status: "Consumido",
    impact: "8 camisetas minimalistas entregues como acao de marketing",
  },
  {
    title: "Cartao operacional",
    category: "Cartao",
    dueDate: "Fechamento em 12 dias",
    amount: "R$ 1.434",
    status: "Em aberto",
    impact: "Inclui embalagem, frete e pequenas compras da operacao",
  },
];

export const productionProjection: ProjectionRow[] = [
  {
    title: "Se vender o estoque atual",
    value: "R$ 16.980 liquidos",
    detail:
      "Estimativa combinando mix atual de minimalista e full com taxas da Nuvem Pago.",
  },
  {
    title: "Media diaria atual",
    value: "R$ 421 liquidos / dia",
    detail:
      "Base para entender quanto entra ate o fechamento do mes e cada vencimento.",
  },
  {
    title: "Data ideal do novo pedido",
    value: "Daqui 7 dias",
    detail:
      "Assim voce ganha tempo de fabrica e evita ruptura nas camisetas pretas.",
  },
  {
    title: "Ponto mais sensivel",
    value: "Arte + preto M",
    detail:
      "Hoje a venda pode travar mais por falta de arte ou tamanho do que por demanda.",
  },
];

export const stockOverviewMetrics: OperationalMetric[] = [
  {
    label: "Total de camisetas base",
    value: "146",
    detail: "Saldo somado entre preta, branca e roxa em todos os tamanhos",
  },
  {
    label: "Ja estampadas",
    value: "29",
    detail: "Pecas prontas que ja nao contam como camiseta lisa livre",
  },
  {
    label: "Reservadas",
    value: "18",
    detail: "Pecas separadas para pedido, campanha ou influenciador",
  },
  {
    label: "Livres para usar",
    value: "99",
    detail: "O que ainda pode virar nova estampa ou atender um pedido novo",
  },
];

export const stockRows: StockRow[] = [
  {
    sku: "Oversized preta",
    color: "Preta",
    size: "M",
    total: "30",
    printed: "8",
    reserved: "5",
    free: "17",
    coverage: "9 dias",
    reorderPoint: "25",
    action: "Comprar junto no proximo lote",
  },
  {
    sku: "Oversized preta",
    color: "Preta",
    size: "G",
    total: "24",
    printed: "4",
    reserved: "3",
    free: "17",
    coverage: "14 dias",
    reorderPoint: "20",
    action: "Monitorar; se o ritmo subir, antecipa",
  },
  {
    sku: "Oversized branca",
    color: "Branca",
    size: "M",
    total: "28",
    printed: "3",
    reserved: "2",
    free: "23",
    coverage: "22 dias",
    reorderPoint: "18",
    action: "Saudavel por enquanto",
  },
  {
    sku: "Oversized roxa",
    color: "Roxa",
    size: "G",
    total: "18",
    printed: "5",
    reserved: "2",
    free: "11",
    coverage: "16 dias",
    reorderPoint: "12",
    action: "Pode esperar a proxima leitura",
  },
  {
    sku: "Minimalista branca",
    color: "Branca",
    size: "P",
    total: "21",
    printed: "9",
    reserved: "6",
    free: "6",
    coverage: "19 dias",
    reorderPoint: "15",
    action: "Estampar so o necessario para nao travar as livres",
  },
];

export const artMetrics: OperationalMetric[] = [
  {
    label: "Artes ativas",
    value: "8",
    detail: "Modelos com giro real e demanda para nova reposicao",
  },
  {
    label: "DTF disponivel",
    value: "27",
    detail: "Saldo somado para sustentar a fila de producao atual",
  },
  {
    label: "Artes em risco",
    value: "2",
    detail: "Ja perto de acabar antes do proximo pedido de DTF",
  },
  {
    label: "Lead time do DTF",
    value: "5 dias",
    detail: "Usado para decidir a data ideal de nova compra das artes",
  },
];

export const artRows: ArtRow[] = [
  {
    art: "RM Basic",
    type: "Minimalista",
    dtfAvailable: "1",
    averageOutput: "0,6 por dia",
    estimatedCoverage: "2 dias",
    costRule: "Custo da peca R$ 32",
    action: "Pedir nova rodada agora",
  },
  {
    art: "Power Back",
    type: "Full",
    dtfAvailable: "3",
    averageOutput: "0,4 por dia",
    estimatedCoverage: "7 dias",
    costRule: "Custo da peca R$ 52",
    action: "Ja preparar novo pedido",
  },
  {
    art: "Lift Club",
    type: "Full",
    dtfAvailable: "6",
    averageOutput: "0,3 por dia",
    estimatedCoverage: "20 dias",
    costRule: "Custo da peca R$ 52",
    action: "Saudavel",
  },
  {
    art: "Core Small",
    type: "Minimalista",
    dtfAvailable: "8",
    averageOutput: "0,5 por dia",
    estimatedCoverage: "16 dias",
    costRule: "Custo da peca R$ 32",
    action: "Saudavel",
  },
];

export const purchasePlanMetrics: OperationalMetric[] = [
  {
    label: "Pedido atual da fabrica",
    value: "R$ 5.000",
    detail: "Base de camisetas do ciclo atual ainda em pagamento 15/30/45 dias",
  },
  {
    label: "Novo lote sugerido",
    value: "R$ 6.200",
    detail: "Valor projetado para manter ou subir o nivel do lote anterior",
  },
  {
    label: "Momento ideal da recompra",
    value: "7 dias",
    detail: "Pra nao faltar principalmente preta M e DTF da RM Basic",
  },
];

export const purchasePlanRows: ProjectionRow[] = [
  {
    title: "Repetir o lote atual",
    value: "146 camisetas",
    detail:
      "Com o custo medio atual, esse lote pede algo perto de R$ 5.000 a R$ 5.300.",
  },
  {
    title: "Aumentar o lote",
    value: "+20% de volume",
    detail:
      "Viavel somente se a media diaria continuar acima de R$ 400 liquidos por dia.",
  },
  {
    title: "Mistura sugerida",
    value: "Mais preto M e branco M",
    detail:
      "Hoje sao as combinacoes que mais sustentam giro e reposicao rapida.",
  },
];
