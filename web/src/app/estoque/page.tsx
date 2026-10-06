import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import modernStyles from "./estoque-modern.module.css";
import {
  createManualStockEntry,
  createManualStockExit,
  loadStockLedgerModuleData,
  reviewPendingStockMovement,
  type SiteArtSelectionOption,
  type StockMovement,
  type StockSelectionOption,
} from "@/lib/operacoes/repository";

const ENTRY_ORIGINS = [
  "compra",
  "fornecedor",
  "devolucao",
  "inventario",
  "ajuste",
] as const;

const EXIT_ORIGINS = [
  "venda",
  "brinde",
  "perda",
  "amostra",
  "ajuste",
] as const;
const LOW_STOCK_THRESHOLD = 5;
const CRITICAL_LOW_STOCK_THRESHOLD = 2;

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CombinedStockBaseOption = {
  key: string;
  sku: string;
  color: string;
  size: string;
  plain: number;
  source: "estoque" | "nuvemshop";
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatMonthInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getSelectedMonth(searchParams: Record<string, string | string[] | undefined>) {
  const raw = getSearchValue(searchParams, "month").trim();
  return /^\d{4}-\d{2}$/.test(raw) ? raw : formatMonthInput(new Date());
}

function getMonthLabel(selectedMonth: string) {
  const [yearText, monthText] = selectedMonth.split("-");
  const year = Number.parseInt(yearText || "", 10);
  const monthIndex = Number.parseInt(monthText || "", 10) - 1;
  const date = new Date(year, monthIndex, 1);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function getMonthStartDate(selectedMonth: string) {
  return `${selectedMonth}-01`;
}

function getDefaultMovementDateForMonth(selectedMonth: string) {
  const today = new Date();
  const currentMonth = formatMonthInput(today);

  if (selectedMonth === currentMonth) {
    return `${selectedMonth}-${String(today.getDate()).padStart(2, "0")}`;
  }

  return getMonthStartDate(selectedMonth);
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

function buildStockBaseKey(sku: string, color: string, size: string) {
  return [sku, color, size].join("||");
}

function parseStockBaseKey(value: string) {
  const [sku = "", color = "", size = ""] = value.split("||");
  return {
    sku: sku.trim(),
    color: color.trim(),
    size: size.trim(),
  };
}

function buildCombinedStockBaseOptions(
  stockOptions: StockSelectionOption[],
  artOptions: SiteArtSelectionOption[],
) {
  const optionMap = new Map<string, CombinedStockBaseOption>();

  for (const item of stockOptions) {
    const key = buildStockBaseKey(item.sku, item.color, item.size);
    optionMap.set(key, {
      key,
      sku: item.sku,
      color: item.color,
      size: item.size,
      plain: item.plain,
      source: "estoque",
    });
  }

  for (const art of artOptions) {
    const key = buildStockBaseKey(art.sku, art.color, art.size);
    if (optionMap.has(key)) {
      continue;
    }

    optionMap.set(key, {
      key,
      sku: art.sku,
      color: art.color,
      size: art.size,
      plain: 0,
      source: "nuvemshop",
    });
  }

  return Array.from(optionMap.values()).sort((left, right) => {
    const leftKey = `${left.sku}-${left.color}-${left.size}`;
    const rightKey = `${right.sku}-${right.color}-${right.size}`;
    return leftKey.localeCompare(rightKey);
  });
}

function appendFlashToRedirect(
  basePath: string,
  status: "success" | "error",
  message: string,
) {
  const [path, query = ""] = basePath.split("?");
  const params = new URLSearchParams(query);
  params.set("stockStatus", status);
  params.set("stockMessage", message);
  return `${path || "/estoque"}?${params.toString()}`;
}

async function registerStockEntryAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "compra").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  if (!base.sku || !base.color || !base.size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da entrada."));
  }

  const result = await createManualStockEntry({
    ...base,
    quantity,
    movementDate,
    originType,
    originReference,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel registrar a entrada.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", "Entrada registrada com sucesso."));
}

async function registerStockExitAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const artSelectionId = String(formData.get("artSelectionId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "venda").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const alreadyPrinted = String(formData.get("alreadyPrinted") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  if (!base.sku || !base.color || !base.size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da saida."));
  }

  const result = await createManualStockExit({
    ...base,
    quantity,
    movementDate,
    originType,
    originReference,
    artSelectionId,
    alreadyPrinted,
    notes,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel registrar a saida.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", result.persistence.message));
}

async function reviewPendingStockExitAction(formData: FormData) {
  "use server";

  const redirectTo = String(formData.get("redirectTo") ?? "/estoque").trim() || "/estoque";
  const movementId = String(formData.get("movementId") ?? "").trim();
  const stockBaseKey = String(formData.get("stockBaseKey") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const originReference = String(formData.get("originReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const decision = String(formData.get("decision") ?? "aprovar").trim();
  const deductFromStock = String(formData.get("deductFromStock") ?? "").trim();
  const alreadyPrinted = String(formData.get("alreadyPrinted") ?? "").trim();
  const base = parseStockBaseKey(stockBaseKey);

  const result = await reviewPendingStockMovement(movementId, {
    ...base,
    quantity,
    originReference,
    notes,
    decision,
    deductFromStock,
    alreadyPrinted,
  });

  if (!result.ok) {
    redirect(
      appendFlashToRedirect(
        redirectTo,
        "error",
        result.persistence.message || "Nao foi possivel revisar a saida.",
      ),
    );
  }

  revalidatePath("/estoque");
  redirect(appendFlashToRedirect(redirectTo, "success", result.persistence.message));
}

function labelMovementType(value: StockMovement["movementType"]) {
  if (value === "entrada") {
    return "Entrada";
  }

  if (value === "saida") {
    return "Saida";
  }

  return "Ajuste";
}

function labelOrigin(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "-";
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

function labelReviewStatus(value: StockMovement["reviewStatus"], stockEffectApplied: boolean) {
  if (value === "pendente") {
    return "Pendente";
  }

  if (value === "ignorado") {
    return "Ignorado";
  }

  return stockEffectApplied ? "Baixado" : "Aprovado sem baixa";
}

function sumPlainStockByColor(stockOptions: StockSelectionOption[], color: string) {
  return stockOptions.reduce((sum, item) => {
    return item.color.toLowerCase() === color.toLowerCase() ? sum + item.plain : sum;
  }, 0);
}

function buildLowStockLabel(item: StockSelectionOption) {
  return `${item.sku} · ${item.color} · ${item.size}`;
}

function formatPiecesPerOrder(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricIcon({ kind }: { kind: "stock" | "art" | "alert" | "sales" | "orders" }) {
  if (kind === "stock") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 3L19 7V17L12 21L5 17V7L12 3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M5 7L12 11L19 7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 11V21" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  if (kind === "art") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 5.5H17V9.5C17 11.7 15.2 13.5 13 13.5H11C8.8 13.5 7 11.7 7 9.5V5.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9 20H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 13.5V20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "alert") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M12 4L21 20H3L12 4Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M12 9V13.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 17H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "sales") {
    return (
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M6.5 7.5H17.5L20 10L12 18L4 10L6.5 7.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M9.5 7.5L12 18L14.5 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 18V10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18V6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M18 18V13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M4 20H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default async function EstoquePage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth = getSelectedMonth(resolvedSearchParams);
  const monthLabel = getMonthLabel(selectedMonth);
  const redirectTo = `/estoque?month=${selectedMonth}`;
  const stockStatus = getSearchValue(resolvedSearchParams, "stockStatus");
  const stockMessage = getSearchValue(resolvedSearchParams, "stockMessage");

  const stockData = await loadStockLedgerModuleData(selectedMonth);
  const combinedBaseOptions = buildCombinedStockBaseOptions(
    stockData.stockOptions,
    stockData.artOptions,
  );
  const totalPlainStock = stockData.stockOptions.reduce((sum, item) => sum + item.plain, 0);
  const totalEntries = stockData.movements.reduce(
    (sum, movement) => sum + (movement.movementType === "entrada" ? movement.quantity : 0),
    0,
  );
  const totalExits = stockData.movements.reduce(
    (sum, movement) => sum + (movement.movementType === "saida" ? movement.quantity : 0),
    0,
  );
  const siteSaleMovements = stockData.movements.filter(
    (movement) => movement.movementType === "saida" && movement.originType === "venda",
  );
  const soldPiecesInMonth = siteSaleMovements.reduce((sum, movement) => sum + movement.quantity, 0);
  const soldOrdersCount = new Set(
    siteSaleMovements.map((movement) => movement.originReference || movement.id),
  ).size;
  const piecesPerOrder = soldOrdersCount > 0 ? soldPiecesInMonth / soldOrdersCount : 0;
  const artModelCount = stockData.artOptions.length;
  const pendingSiteExits = stockData.movements.filter(
    (movement) => movement.movementType === "saida" && movement.reviewStatus === "pendente",
  );
  const lowStockItems = [...stockData.stockOptions]
    .filter((item) => item.plain <= LOW_STOCK_THRESHOLD)
    .sort((left, right) => {
      if (left.plain !== right.plain) {
        return left.plain - right.plain;
      }

      return buildLowStockLabel(left).localeCompare(buildLowStockLabel(right));
    });
  const criticalLowStockItems = lowStockItems.filter(
    (item) => item.plain <= CRITICAL_LOW_STOCK_THRESHOLD,
  );
  const warningLowStockItems = lowStockItems.filter(
    (item) => item.plain > CRITICAL_LOW_STOCK_THRESHOLD,
  );

  return (
    <AppShell
      title="Estoque"
      subtitle="Baixe as saidas do site manualmente, confira alertas quando a variacao nao bater e ajuste cor ou tamanho antes de aprovar a baixa."
      currentPath="/estoque"
    >
      <section className={styles.section}>
        <div className={modernStyles.dashboardHero}>
          <div className={modernStyles.dashboardTopbar}>
            <div className={modernStyles.dashboardHeading}>
              <h2>Estoque de camisetas</h2>
              <p>
                Controle por modelo, arte, cor e tamanho. Adicione entradas, registre saidas e
                acompanhe o estoque em tempo real.
              </p>
            </div>

            <form className={modernStyles.periodCard} method="get">
              <label className={modernStyles.periodField}>
                <span>Competencia</span>
                <input type="month" name="month" defaultValue={selectedMonth} />
              </label>
              <div className={modernStyles.periodActions}>
                <button type="submit" className={styles.primaryButton}>
                  Atualizar
                </button>
              </div>
            </form>
          </div>

          <div className={modernStyles.kpiGrid}>
            <article className={`${modernStyles.kpiCard} ${modernStyles.kpiCardPositive}`}>
              <div className={modernStyles.kpiIcon}>
                <MetricIcon kind="stock" />
              </div>
              <div className={modernStyles.kpiBody}>
                <span className={modernStyles.kpiLabel}>Pecas em estoque</span>
                <strong className={modernStyles.kpiValue}>{String(totalPlainStock)}</strong>
                <span className={modernStyles.kpiHint}>Bases lisas disponiveis agora</span>
              </div>
            </article>

            <article className={modernStyles.kpiCard}>
              <div className={modernStyles.kpiIcon}>
                <MetricIcon kind="art" />
              </div>
              <div className={modernStyles.kpiBody}>
                <span className={modernStyles.kpiLabel}>Modelos/estampas</span>
                <strong className={modernStyles.kpiValue}>{String(artModelCount)}</strong>
                <span className={modernStyles.kpiHint}>Estampas prontas para saida</span>
              </div>
            </article>

            <article className={`${modernStyles.kpiCard} ${modernStyles.kpiCardCritical}`}>
              <div className={modernStyles.kpiIcon}>
                <MetricIcon kind="alert" />
              </div>
              <div className={modernStyles.kpiBody}>
                <span className={modernStyles.kpiLabel}>Estoque critico</span>
                <strong className={modernStyles.kpiValue}>{String(criticalLowStockItems.length)}</strong>
                <span className={modernStyles.kpiHint}>
                  Abaixo de {CRITICAL_LOW_STOCK_THRESHOLD + 1} pecas
                </span>
              </div>
            </article>

            <article className={modernStyles.kpiCard}>
              <div className={modernStyles.kpiIcon}>
                <MetricIcon kind="sales" />
              </div>
              <div className={modernStyles.kpiBody}>
                <span className={modernStyles.kpiLabel}>Pecas vendidas no mes</span>
                <strong className={modernStyles.kpiValue}>{String(soldPiecesInMonth)}</strong>
                <span className={modernStyles.kpiHint}>{String(soldOrdersCount)} pedidos de venda</span>
              </div>
            </article>

            <article className={modernStyles.kpiCard}>
              <div className={modernStyles.kpiIcon}>
                <MetricIcon kind="orders" />
              </div>
              <div className={modernStyles.kpiBody}>
                <span className={modernStyles.kpiLabel}>Pecas por pedido</span>
                <strong className={modernStyles.kpiValue}>{formatPiecesPerOrder(piecesPerOrder)}</strong>
                <span className={modernStyles.kpiHint}>
                  Media nas saidas de venda do mes
                </span>
              </div>
            </article>
          </div>

          <div className={modernStyles.summaryGrid}>
            <article className={modernStyles.summaryCard}>
              <div className={modernStyles.summaryHeader}>
                <div>
                  <h3>Estoque por cor (camisetas lisas)</h3>
                  <p>Resumo rapido das bases fisicas disponiveis por cor.</p>
                </div>
              </div>

              <div className={modernStyles.colorGrid}>
                {[
                  {
                    label: "Preta",
                    value: sumPlainStockByColor(stockData.stockOptions, "Preta"),
                    swatchClass: modernStyles.swatchBlack,
                  },
                  {
                    label: "Branca",
                    value: sumPlainStockByColor(stockData.stockOptions, "Branca"),
                    swatchClass: modernStyles.swatchWhite,
                  },
                  {
                    label: "Roxa",
                    value: sumPlainStockByColor(stockData.stockOptions, "Roxa"),
                    swatchClass: modernStyles.swatchPurple,
                  },
                  {
                    label: "Rosa",
                    value: sumPlainStockByColor(stockData.stockOptions, "Rosa"),
                    swatchClass: modernStyles.swatchPink,
                  },
                ].map((item) => (
                  <article key={item.label} className={modernStyles.colorCard}>
                    <span className={`${modernStyles.colorSwatch} ${item.swatchClass}`} />
                    <div className={modernStyles.colorBody}>
                      <strong>{item.label}</strong>
                      <span>{String(item.value)}</span>
                      <small>pecas</small>
                    </div>
                  </article>
                ))}
              </div>
            </article>

            <article className={modernStyles.summaryCard}>
              <div className={modernStyles.summaryHeader}>
                <div>
                  <h3>Acoes rapidas</h3>
                  <p>Pulos diretos para as acoes operacionais mais usadas.</p>
                </div>
              </div>

              <div className={modernStyles.actionStack}>
                <a href="#entrada-estoque" className={`${styles.primaryButton} ${modernStyles.actionButton}`}>
                  + Entrada de estoque
                </a>
                <a href="#baixa-manual" className={`${styles.secondaryButton} ${modernStyles.actionButton} ${modernStyles.actionDanger}`}>
                  - Baixa manual
                </a>
                <a href="#saldo-atual" className={`${styles.secondaryButton} ${modernStyles.actionButton}`}>
                  Ajustar estoque
                </a>
              </div>

              <div className={modernStyles.metaRow}>
                <span className={modernStyles.metaBadge}>
                  Alertas pendentes: {String(pendingSiteExits.length)}
                </span>
                <span className={modernStyles.metaBadge}>
                  Estoque baixo: {String(lowStockItems.length)}
                </span>
                <span className={modernStyles.metaBadge}>
                  Entradas do mes: {String(totalEntries)}
                </span>
                <span className={modernStyles.metaBadge}>
                  Saidas do mes: {String(totalExits)}
                </span>
              </div>
            </article>
          </div>
        </div>

        {criticalLowStockItems.length > 0 ? (
          <div className={styles.warningPanel}>
            <h3>Estoque critico por variacao</h3>
            <p>
              Estas bases ja chegaram em {CRITICAL_LOW_STOCK_THRESHOLD} ou menos pecas lisas e
              precisam de atencao primeiro.
            </p>
            <div className={styles.chipRow}>
              {criticalLowStockItems.map((item) => (
                <span key={item.id} className={styles.chip}>
                  {buildLowStockLabel(item)} · saldo {String(item.plain)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {warningLowStockItems.length > 0 ? (
          <div className={styles.warningPanel}>
            <h3>Estoque baixo por variacao</h3>
            <p>
              Entram aqui todas as bases com {LOW_STOCK_THRESHOLD} ou menos pecas lisas. Isso vale
              por modelo, cor e numeracao.
            </p>
            <div className={styles.chipRow}>
              {warningLowStockItems.map((item) => (
                <span key={item.id} className={styles.chip}>
                  {buildLowStockLabel(item)} · saldo {String(item.plain)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {lowStockItems.length === 0 ? (
          <div className={styles.callout}>
            <h3>Sem estoque baixo agora</h3>
            <p>
              Nenhuma variacao esta com {LOW_STOCK_THRESHOLD} ou menos camisetas lisas no momento.
            </p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.configGrid}>
          <article className={styles.configCard}>
            <form className={styles.formStack} method="get">
              <label className={styles.filterField}>
                <span>Mes</span>
                <input type="month" name="month" defaultValue={selectedMonth} />
              </label>
              <div className={styles.filterActions}>
                <button type="submit" className={styles.primaryButton}>
                  Filtrar
                </button>
                <a href="/estoque" className={styles.secondaryButton}>
                  Voltar ao atual
                </a>
              </div>
            </form>
          </article>
        </div>

        <div className={styles.configGrid}>
          <article className={styles.configCard} id="entrada-estoque">
            <div className={styles.listTitle}>Adicionar ao estoque</div>
            <p className={styles.sectionSubtitle}>
              Use aqui para chegada de lote, devolucao ou correcao de quantidade fisica.
            </p>

            <form action={registerStockEntryAction} className={styles.formStack}>
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <label className={styles.filterField}>
                <span>Cor, tamanho e base</span>
                <select name="stockBaseKey" required defaultValue={combinedBaseOptions[0]?.key ?? ""}>
                  {combinedBaseOptions.length > 0 ? (
                    combinedBaseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.color} · {option.size} · {option.sku}
                        {option.source === "nuvemshop" ? " · novo" : ""}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhuma base mapeada</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Quantidade</span>
                <input type="number" name="quantity" min="1" step="1" defaultValue="1" required />
              </label>

              <label className={styles.filterField}>
                <span>Data</span>
                <input
                  type="date"
                  name="movementDate"
                  defaultValue={getDefaultMovementDateForMonth(selectedMonth)}
                  required
                />
              </label>

              <label className={styles.filterField}>
                <span>Origem</span>
                <select name="originType" defaultValue="compra">
                  {ENTRY_ORIGINS.map((origin) => (
                    <option key={origin} value={origin}>
                      {labelOrigin(origin)}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Origem / referencia</span>
                <input type="text" name="originReference" placeholder="Ex.: NF 302 ou lote 07" />
              </label>

              <label className={styles.filterField}>
                <span>Observacao</span>
                <input type="text" name="notes" placeholder="Opcional" />
              </label>

              <div className={styles.filterActions}>
                <button type="submit" className={styles.primaryButton}>
                  Salvar entrada
                </button>
              </div>
            </form>
          </article>

          <article className={styles.configCard} id="baixa-manual">
            <div className={styles.listTitle}>Registrar saida manual</div>
            <p className={styles.sectionSubtitle}>
              Quando a origem for venda, a saida entra pendente para voce revisar antes de baixar o
              estoque. Se faltar a combinacao, ela vira alerta automaticamente.
            </p>

            <form action={registerStockExitAction} className={styles.formStack}>
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <label className={styles.filterField}>
                <span>Cor, tamanho e base</span>
                <select name="stockBaseKey" required defaultValue={combinedBaseOptions[0]?.key ?? ""}>
                  {combinedBaseOptions.length > 0 ? (
                    combinedBaseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.color} · {option.size} · {option.sku} · saldo {option.plain}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhuma base mapeada</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Nome da arte</span>
                <select name="artSelectionId" defaultValue="">
                  <option value="">Sem arte vinculada</option>
                  {stockData.artOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.artName}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Quantidade</span>
                <input type="number" name="quantity" min="1" step="1" defaultValue="1" required />
              </label>

              <label className={styles.filterField}>
                <span>Data</span>
                <input
                  type="date"
                  name="movementDate"
                  defaultValue={getDefaultMovementDateForMonth(selectedMonth)}
                  required
                />
              </label>

              <label className={styles.filterField}>
                <span>Origem</span>
                <select name="originType" defaultValue="venda">
                  {EXIT_ORIGINS.map((origin) => (
                    <option key={origin} value={origin}>
                      {labelOrigin(origin)}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Origem / referencia</span>
                <input type="text" name="originReference" placeholder="Ex.: #201" />
              </label>

              <label className={styles.checkboxCard}>
                <input type="checkbox" name="alreadyPrinted" value="true" />
                <span>
                  <strong>Ja estava estampado</strong>
                  <span>Registra a saida, mas nao baixa a lisa porque a peca veio pronta de outro lote.</span>
                </span>
              </label>

              <label className={styles.filterField}>
                <span>Observacao</span>
                <input type="text" name="notes" placeholder="Opcional" />
              </label>

              <div className={styles.filterActions}>
                <button type="submit" className={styles.primaryButton}>
                  Salvar saida
                </button>
              </div>
            </form>
          </article>
        </div>

        {stockMessage ? (
          <div className={stockStatus === "success" ? styles.callout : styles.warningPanel}>
            <h3>{stockStatus === "success" ? "Estoque atualizado" : "Nao foi possivel atualizar"}</h3>
            <p>{stockMessage}</p>
          </div>
        ) : null}

        <div className={stockData.persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>Leitura do estoque</h3>
          <p>{stockData.persistence.message}</p>
        </div>
      </section>

      <section className={styles.section} id="saldo-atual">
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Saidas do site para revisar</div>
            <p className={styles.sectionSubtitle}>
              Esse extrato segura as vendas em revisao manual. Aqui voce pode trocar a base, mudar
              tamanho ou cor, baixar agora do estoque, aprovar sem baixa ou ignorar.
            </p>
          </div>
        </div>

        <div className={styles.configGrid}>
          {pendingSiteExits.length > 0 ? (
            pendingSiteExits.map((movement) => {
              const defaultBaseKey = buildStockBaseKey(
                movement.sku,
                movement.color,
                movement.size,
              );
              const currentOption = combinedBaseOptions.find((option) => option.key === defaultBaseKey);

              return (
                <article key={movement.id} className={styles.configCard}>
                  <div className={styles.listTitle}>
                    {movement.artName || "Venda do site"} · {movement.color} · {movement.size}
                  </div>
                  <p className={styles.sectionSubtitle}>
                    Data {formatDate(movement.movementDate)} · Ref. {movement.originReference || "-"} ·
                    Qtd {String(movement.quantity)}
                  </p>

                  <div className={styles.warningPanel}>
                    <h3>Conferencia pendente</h3>
                    <p>{movement.reasonText || "Revise a combinacao antes de baixar o estoque."}</p>
                  </div>

                  <form action={reviewPendingStockExitAction} className={styles.formStack}>
                    <input type="hidden" name="redirectTo" value={redirectTo} />
                    <input type="hidden" name="movementId" value={movement.id} />

                    <label className={styles.filterField}>
                      <span>Base que vai baixar</span>
                      <select name="stockBaseKey" defaultValue={defaultBaseKey} required>
                        {combinedBaseOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.color} · {option.size} · {option.sku} · saldo {option.plain}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.filterField}>
                      <span>Quantidade</span>
                      <input
                        type="number"
                        name="quantity"
                        min="1"
                        step="1"
                        defaultValue={String(movement.quantity)}
                        required
                      />
                    </label>

                    <label className={styles.filterField}>
                      <span>Origem / referencia</span>
                      <input
                        type="text"
                        name="originReference"
                        defaultValue={movement.originReference}
                        placeholder="Ex.: #201"
                      />
                    </label>

                    <label className={styles.checkboxCard}>
                      <input
                        type="checkbox"
                        name="deductFromStock"
                        value="true"
                        defaultChecked={(currentOption?.plain ?? 0) >= movement.quantity}
                      />
                      <span>
                        <strong>Baixar do estoque agora</strong>
                        <span>Desmarque para aprovar a saida sem reduzir a lisa fisica.</span>
                      </span>
                    </label>

                    <label className={styles.checkboxCard}>
                      <input type="checkbox" name="alreadyPrinted" value="true" />
                      <span>
                        <strong>Ja estava estampado</strong>
                        <span>Marca como saida aprovada, mas sem baixa da lisa deste estoque.</span>
                      </span>
                    </label>

                    <label className={styles.filterField}>
                      <span>Observacao da revisao</span>
                      <input
                        type="text"
                        name="notes"
                        placeholder="Ex.: vou baixar do CM preto em vez do P"
                      />
                    </label>

                    <div className={styles.filterActions}>
                      <button type="submit" name="decision" value="aprovar" className={styles.primaryButton}>
                        Aprovar / atualizar
                      </button>
                      <button
                        type="submit"
                        name="decision"
                        value="ignorar"
                        className={styles.secondaryButton}
                      >
                        Ignorar alerta
                      </button>
                    </div>
                  </form>
                </article>
              );
            })
          ) : (
            <article className={styles.configCard}>
              <div className={styles.callout}>
                <h3>Nenhuma saida pendente</h3>
                <p>Tudo o que entrou do site neste mes ja foi revisado por voce.</p>
              </div>
            </article>
          )}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Saldo atual das lisas</div>
            <p className={styles.sectionSubtitle}>
              Aqui voce ve exatamente o que ainda tem de camiseta lisa por base, cor e tamanho.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Base</th>
                <th>Cor</th>
                <th>Tamanho</th>
                <th>Lisas</th>
              </tr>
            </thead>
            <tbody>
              {stockData.stockOptions.length > 0 ? (
                stockData.stockOptions.map((item) => (
                  <tr key={item.id}>
                    <td>{item.sku}</td>
                    <td>{item.color}</td>
                    <td>{item.size}</td>
                    <td>{String(item.plain)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>Nenhuma base cadastrada no estoque ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Extrato de entradas e saidas</div>
            <p className={styles.sectionSubtitle}>
              O extrato mostra a origem, a referencia, a arte e o status da revisao de cada saida
              do site.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
                <th>Status</th>
                <th>Base</th>
                <th>Cor</th>
                <th>Tamanho</th>
                <th>Arte</th>
                <th>Origem</th>
                <th>Numero</th>
                <th>Qtd</th>
                <th>Saldo apos</th>
              </tr>
            </thead>
            <tbody>
              {stockData.movements.length > 0 ? (
                stockData.movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDate(movement.movementDate)}</td>
                    <td
                      className={
                        movement.movementType === "entrada"
                          ? styles.profitPositive
                          : movement.movementType === "saida"
                            ? styles.profitAttention
                            : undefined
                      }
                    >
                      {labelMovementType(movement.movementType)}
                    </td>
                    <td>{labelReviewStatus(movement.reviewStatus, movement.stockEffectApplied)}</td>
                    <td>{movement.sku}</td>
                    <td>{movement.color}</td>
                    <td>{movement.size}</td>
                    <td>{movement.artName || "-"}</td>
                    <td>{labelOrigin(movement.originType)}</td>
                    <td>{movement.originReference || "-"}</td>
                    <td>{String(movement.quantity)}</td>
                    <td>{String(movement.plainAfter)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11}>Nenhuma movimentacao de camisetas registrada neste mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
