export type Metric = {
  label: string;
  value: string;
  detail: string;
};

export type AlertItem = {
  title: string;
  detail: string;
  level: "alto" | "medio" | "baixo";
};

export type OrderRow = {
  id: string;
  origin: string;
  product: string;
  variant: string;
  art: string;
  influencer: string;
  status: string;
  total: string;
  margin: string;
};

export type FeeRule = {
  channel: string;
  payment: string;
  installments: string;
  fee: string;
  fixedFee: string;
  notes: string;
};

export type MarginRow = {
  label: string;
  revenue: string;
  feeImpact: string;
  netMargin: string;
};

export type Scenario = {
  title: string;
  salePrice: string;
  costs: string[];
  result: string;
  recommendation: string;
};

export type InfluencerRow = {
  name: string;
  code: string;
  channel: string;
  orders: string;
  revenue: string;
  commission: string;
  status: string;
};

export type EmployeeRow = {
  name: string;
  role: string;
  access: string[];
  restrictions: string;
  status: string;
};

export type CompanyFieldRow = {
  name: string;
  area: string;
  type: string;
  required: string;
  notes: string;
};

export type CustomStatusRow = {
  name: string;
  flow: string;
  sla: string;
  color: string;
  active: string;
};

export type RouteZoneRow = {
  name: string;
  coverage: string;
  deadline: string;
  fee: string;
  active: string;
};

export const dashboardMetrics: Metric[] = [
  {
    label: "Faturamento do mes",
    value: "R$ 48.320",
    detail: "+12% vs. mes anterior",
  },
  {
    label: "Lucro medio por peca",
    value: "R$ 28,40",
    detail: "Ja considerando taxas e frete",
  },
  {
    label: "Pedidos em producao",
    value: "37",
    detail: "19 da Nuvem Shop e 18 do TikTok Shop",
  },
  {
    label: "Taxas pagas no mes",
    value: "R$ 4.186",
    detail: "8,66% do faturamento bruto",
  },
];

export const stockAlerts: AlertItem[] = [
  {
    title: "Camiseta preta M abaixo do minimo",
    detail: "Saldo atual: 12 pecas. Minimo recomendado: 25.",
    level: "alto",
  },
  {
    title: "Frete gratis reduzindo margem no TikTok Shop",
    detail: "7 pedidos da semana ficaram abaixo da margem alvo.",
    level: "medio",
  },
  {
    title: "Arte PR-05 em alta",
    detail: "A variacao preta GG saiu 3,2x mais que a media.",
    level: "baixo",
  },
];

export const ordersOverview: Metric[] = [
  {
    label: "Pedidos de hoje",
    value: "14",
    detail: "9 aprovados e 5 em separacao",
  },
  {
    label: "Ticket medio",
    value: "R$ 132,70",
    detail: "Maior concentracao em combos de 2 pecas",
  },
  {
    label: "Melhor canal",
    value: "TikTok Shop",
    detail: "Maior volume; margem menor que a Nuvem Shop",
  },
];

export const influencerMetrics: Metric[] = [
  {
    label: "Influenciador lider",
    value: "Lari RM",
    detail: "32 pedidos no mes",
  },
  {
    label: "Receita por influenciadores",
    value: "R$ 11.940",
    detail: "24,7% do total vendido",
  },
  {
    label: "Comissao estimada",
    value: "R$ 1.105",
    detail: "Base para o programa de pontos",
  },
];

export const orderRows: OrderRow[] = [
  {
    id: "#1042",
    origin: "Nuvem Shop",
    product: "Oversized Core",
    variant: "Preta / M",
    art: "RM Power",
    influencer: "Sem vinculo",
    status: "Em producao",
    total: "R$ 149,90",
    margin: "R$ 41,20",
  },
  {
    id: "#1041",
    origin: "TikTok Shop",
    product: "Baby Tee",
    variant: "Branca / P",
    art: "Lift Club",
    influencer: "Lari RM",
    status: "Aguardando estampa",
    total: "R$ 99,90",
    margin: "R$ 18,50",
  },
  {
    id: "#1040",
    origin: "TikTok Shop",
    product: "Oversized Core",
    variant: "Preta / GG",
    art: "RM Power",
    influencer: "Caio Treina",
    status: "Pronto para envio",
    total: "R$ 159,90",
    margin: "R$ 34,10",
  },
  {
    id: "#1039",
    origin: "Nuvem Shop",
    product: "Regata Dry",
    variant: "Branca / G",
    art: "Squad",
    influencer: "Sem vinculo",
    status: "Novo",
    total: "R$ 89,90",
    margin: "R$ 29,70",
  },
];

export const feeRules: FeeRule[] = [
  {
    channel: "Nuvem Shop",
    payment: "Pix",
    installments: "1x",
    fee: "1,49%",
    fixedFee: "R$ 0,00",
    notes: "Melhor margem liquida",
  },
  {
    channel: "Nuvem Shop",
    payment: "Cartao",
    installments: "1x a 3x",
    fee: "4,89%",
    fixedFee: "R$ 0,39",
    notes: "Monitorar ticket para manter margem",
  },
  {
    channel: "TikTok Shop",
    payment: "Cartao",
    installments: "1x a 6x",
    fee: "7,20%",
    fixedFee: "R$ 0,00",
    notes: "Frete gratis pode reduzir lucro",
  },
  {
    channel: "TikTok Shop",
    payment: "Boleto",
    installments: "1x",
    fee: "3,99%",
    fixedFee: "R$ 1,20",
    notes: "Pouco uso, mas precisa estar mapeado",
  },
];

export const financeMetrics: Metric[] = [
  {
    label: "Margem liquida media",
    value: "24,8%",
    detail: "Meta recomendada: acima de 22%",
  },
  {
    label: "Lucro liquido do mes",
    value: "R$ 11.986",
    detail: "Apos custos, taxas, frete e brindes",
  },
  {
    label: "Impacto do frete gratis",
    value: "R$ 1.420",
    detail: "Principal pressao vinda do TikTok Shop",
  },
  {
    label: "Custo medio por peca",
    value: "R$ 36,80",
    detail: "Inclui camiseta, estampa e embalagem",
  },
];

export const marginBreakdown: MarginRow[] = [
  {
    label: "Nuvem Shop / Pix",
    revenue: "R$ 13.820",
    feeImpact: "R$ 206",
    netMargin: "31,4%",
  },
  {
    label: "Nuvem Shop / Cartao",
    revenue: "R$ 10.460",
    feeImpact: "R$ 549",
    netMargin: "26,1%",
  },
  {
    label: "TikTok Shop / Cartao",
    revenue: "R$ 18.940",
    feeImpact: "R$ 1.363",
    netMargin: "19,8%",
  },
  {
    label: "TikTok Shop / Boleto",
    revenue: "R$ 5.100",
    feeImpact: "R$ 264",
    netMargin: "22,4%",
  },
];

export const simulationScenarios: Scenario[] = [
  {
    title: "Oversized preta no Pix",
    salePrice: "R$ 149,90",
    costs: [
      "Custo da peca: R$ 38,00",
      "Taxa Nuvem Shop Pix: R$ 2,23",
      "Embalagem e operacao: R$ 6,40",
    ],
    result: "Lucro estimado: R$ 103,27 | Margem: 68,9%",
    recommendation: "Preco atual saudavel. Pode segurar promocao leve.",
  },
  {
    title: "Oversized preta no cartao 3x",
    salePrice: "R$ 149,90",
    costs: [
      "Custo da peca: R$ 38,00",
      "Taxa cartao: R$ 7,72",
      "Embalagem e operacao: R$ 6,40",
    ],
    result: "Lucro estimado: R$ 97,78 | Margem: 65,2%",
    recommendation: "Ainda saudavel, mas ja comeca a pressionar a margem.",
  },
  {
    title: "TikTok Shop com frete gratis",
    salePrice: "R$ 139,90",
    costs: [
      "Custo da peca: R$ 38,00",
      "Taxa TikTok Shop: R$ 10,07",
      "Frete subsidiado: R$ 14,50",
    ],
    result: "Lucro estimado: R$ 77,33 | Margem: 55,3%",
    recommendation: "Avaliar reajuste ou gatilho minimo para frete gratis.",
  },
];

export const influencerTableRows: InfluencerRow[] = [
  {
    name: "Lari RM",
    code: "LARIRM",
    channel: "Instagram / TikTok",
    orders: "32",
    revenue: "R$ 5.480",
    commission: "8%",
    status: "Ativa",
  },
  {
    name: "Caio Treina",
    code: "CAIORM",
    channel: "TikTok",
    orders: "21",
    revenue: "R$ 3.760",
    commission: "6%",
    status: "Ativo",
  },
  {
    name: "Bia Power",
    code: "BIARM",
    channel: "Instagram",
    orders: "14",
    revenue: "R$ 2.700",
    commission: "5%",
    status: "Ativa",
  },
];

export const influencerSummaryMetrics: Metric[] = [
  {
    label: "Influenciadores ativos",
    value: "12",
    detail: "3 com maior recorrencia de vendas",
  },
  {
    label: "Faturamento gerado",
    value: "R$ 11.940",
    detail: "24,7% da receita do mes",
  },
  {
    label: "Comissao prevista",
    value: "R$ 1.105",
    detail: "Base para ranking e pontuacao",
  },
  {
    label: "Melhor cupom",
    value: "LARIRM",
    detail: "Maior volume e melhor ticket",
  },
];

export const employeeRows: EmployeeRow[] = [
  {
    name: "Alex",
    role: "Administrador",
    access: [
      "Empresa",
      "Dashboard",
      "Pedidos",
      "Financeiro",
      "Simulador",
      "Influenciadores",
      "Funcionarios",
    ],
    restrictions: "Sem restricoes",
    status: "Ativo",
  },
  {
    name: "Julia",
    role: "Operacao",
    access: ["Dashboard", "Pedidos", "Influenciadores"],
    restrictions: "Nao visualiza financeiro nem permissoes",
    status: "Ativa",
  },
  {
    name: "Mateus",
    role: "Financeiro",
    access: ["Dashboard", "Financeiro", "Simulador"],
    restrictions: "Nao altera pedidos nem equipe",
    status: "Ativo",
  },
];

export const employeeAccessMetrics: Metric[] = [
  {
    label: "Funcionarios cadastrados",
    value: "5",
    detail: "2 admins e 3 acessos setoriais",
  },
  {
    label: "Modulos controlados",
    value: "7",
    detail: "Acesso separado por funcao",
  },
  {
    label: "Usuarios limitados",
    value: "3",
    detail: "Sem acesso a financeiro completo",
  },
];

export const companySetupMetrics: Metric[] = [
  {
    label: "Campos configuraveis",
    value: "9",
    detail: "Pedidos, clientes, expedicao e operacao",
  },
  {
    label: "Status ativos",
    value: "12",
    detail: "Separados por vendas, producao e entrega",
  },
  {
    label: "Zonas de rota",
    value: "4",
    detail: "Com prazo e custo proprios",
  },
  {
    label: "Regras personalizadas",
    value: "6",
    detail: "Prontas para evoluir com cada empresa",
  },
];

export const companyFieldRows: CompanyFieldRow[] = [
  {
    name: "Arte principal",
    area: "Pedido",
    type: "Lista / vinculada ao catalogo",
    required: "Sim",
    notes: "Ajuda a separar producao e historico por arte",
  },
  {
    name: "Observacao interna",
    area: "Pedido",
    type: "Texto longo",
    required: "Nao",
    notes: "Uso para recados da operacao ou comercial",
  },
  {
    name: "Prioridade de producao",
    area: "Pedido",
    type: "Selecao",
    required: "Nao",
    notes: "Normal, urgente, reposicao ou campanha",
  },
  {
    name: "Responsavel da rota",
    area: "Entrega",
    type: "Selecao",
    required: "Nao",
    notes: "Permite amarrar zona e operador responsavel",
  },
];

export const customStatusRows: CustomStatusRow[] = [
  {
    name: "Novo pedido",
    flow: "Venda",
    sla: "Imediato",
    color: "Roxo",
    active: "Ativo",
  },
  {
    name: "Aguardando estampa",
    flow: "Producao",
    sla: "24h",
    color: "Laranja",
    active: "Ativo",
  },
  {
    name: "Separado para rota",
    flow: "Expedicao",
    sla: "12h",
    color: "Azul",
    active: "Ativo",
  },
  {
    name: "Entrega concluida",
    flow: "Entrega",
    sla: "Fim da rota",
    color: "Verde",
    active: "Ativo",
  },
];

export const routeZoneRows: RouteZoneRow[] = [
  {
    name: "Zona Centro",
    coverage: "CEP 01000-000 a 05999-999",
    deadline: "1 dia util",
    fee: "R$ 14,00",
    active: "Ativa",
  },
  {
    name: "Zona Norte",
    coverage: "CEP 02000-000 a 02999-999",
    deadline: "1 a 2 dias",
    fee: "R$ 17,00",
    active: "Ativa",
  },
  {
    name: "Zona ABC",
    coverage: "Santo Andre, Sao Bernardo, Sao Caetano",
    deadline: "2 dias",
    fee: "R$ 19,00",
    active: "Ativa",
  },
  {
    name: "Retirada local",
    coverage: "Sem transporte",
    deadline: "Mesmo dia",
    fee: "R$ 0,00",
    active: "Ativa",
  },
];
