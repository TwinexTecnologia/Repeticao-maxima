import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import {
  createManualStockEntry,
  createManualStockExit,
  loadStockLedgerModuleData,
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

type NamedArtOption = {
  id: string;
  artName: string;
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

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
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

function getUniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
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

function buildNamedArtOptions(artOptions: SiteArtSelectionOption[]) {
  const optionMap = new Map<string, NamedArtOption>();

  for (const option of artOptions) {
    const key = `${option.productId}::${option.artName}`;
    if (!optionMap.has(key)) {
      optionMap.set(key, {
        id: option.id,
        artName: option.artName,
      });
    }
  }

  return Array.from(optionMap.values()).sort((left, right) =>
    left.artName.localeCompare(right.artName),
  );
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
  const sku = String(formData.get("sku") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "compra").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!sku || !color || !size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da entrada."));
  }

  const result = await createManualStockEntry({
    sku,
    color,
    size,
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
  const sku = String(formData.get("sku") ?? "").trim();
  const color = String(formData.get("color") ?? "").trim();
  const size = String(formData.get("size") ?? "").trim();
  const artSelectionId = String(formData.get("artSelectionId") ?? "").trim();
  const quantity = Number.parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;
  const movementDate = String(formData.get("movementDate") ?? "").trim();
  const originType = String(formData.get("originType") ?? "venda").trim();
  const originReference = String(formData.get("originReference") ?? "").trim();
  const alreadyPrinted = String(formData.get("alreadyPrinted") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!sku || !color || !size) {
    redirect(appendFlashToRedirect(redirectTo, "error", "Selecione a camiseta base da saida."));
  }

  const result = await createManualStockExit({
    sku,
    color,
    size,
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
  redirect(appendFlashToRedirect(redirectTo, "success", "Saida registrada com sucesso."));
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
  const modelOptions = getUniqueValues(combinedBaseOptions.map((option) => option.sku));
  const colorOptions = getUniqueValues(combinedBaseOptions.map((option) => option.color));
  const sizeOptions = getUniqueValues(combinedBaseOptions.map((option) => option.size));
  const namedArtOptions = buildNamedArtOptions(stockData.artOptions);
  const totalPlainStock = stockData.stockOptions.reduce((sum, item) => sum + item.plain, 0);
  const totalEntries = stockData.movements.reduce(
    (sum, movement) => sum + (movement.movementType === "entrada" ? movement.quantity : 0),
    0,
  );
  const totalExits = stockData.movements.reduce(
    (sum, movement) => sum + (movement.movementType === "saida" ? movement.quantity : 0),
    0,
  );

  return (
    <AppShell
      title="Estoque"
      subtitle="Controle manual de entrada e saida das camisetas lisas, com arte da Nuvem Shop, data, origem e rastreio por movimentacao."
      currentPath="/estoque"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Estoque de camisetas</div>
            <p className={styles.sectionSubtitle}>
              Tudo aqui gira em cima da lisa fisica em estoque. Quando sair uma estampada, voce registra a arte e o sistema baixa da base correspondente.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Competencia: {monthLabel}</span>
            <span className={styles.chip}>Lisas em estoque: {String(totalPlainStock)}</span>
          </div>
        </div>

        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Lisas em estoque</div>
            <div className={styles.metricValue}>{String(totalPlainStock)}</div>
            <div className={styles.metricHint}>Saldo atual das bases cadastradas</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Entradas do mes</div>
            <div className={styles.metricValue}>{String(totalEntries)}</div>
            <div className={styles.metricHint}>Quantidade adicionada manualmente</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Saidas do mes</div>
            <div className={styles.metricValue}>{String(totalExits)}</div>
            <div className={styles.metricHint}>Quantidade baixada do estoque no mes</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Bases mapeadas</div>
            <div className={styles.metricValue}>{String(combinedBaseOptions.length)}</div>
            <div className={styles.metricHint}>Combinacoes de base, cor e tamanho</div>
          </article>

          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Artes do site</div>
            <div className={styles.metricValue}>{String(stockData.artOptions.length)}</div>
            <div className={styles.metricHint}>Artes listadas pela Nuvem Shop</div>
          </article>
        </div>
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
          <article className={styles.configCard}>
            <div className={styles.listTitle}>Registrar entrada</div>
            <p className={styles.sectionSubtitle}>
              Informe o modelo, a cor, o tamanho, a quantidade, a origem e a data da entrada das camisetas.
              Informe a quantidade, a cor, o tamanho, a origem e a data da entrada das camisetas.
            </p>

            <form action={registerStockEntryAction} className={styles.formStack}>
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <label className={styles.filterField}>

                <span>Modelo</span>
                <select name="sku" required defaultValue={modelOptions[0] ?? ""}>
                  {modelOptions.length > 0 ? (
                    modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}

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
                    <option value="">Nenhum modelo mapeado</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Cor</span>
                <select name="color" required defaultValue={colorOptions[0] ?? ""}>
                  {colorOptions.length > 0 ? (
                    colorOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhuma cor mapeada</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Tamanho</span>
                <select name="size" required defaultValue={sizeOptions[0] ?? ""}>
                  {sizeOptions.length > 0 ? (
                    sizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhum tamanho mapeado</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Quantidade</span>
                <input type="number" name="quantity" min="1" step="1" defaultValue="1" required />
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
                <span>Data</span>
                <input
                  type="date"
                  name="movementDate"
                  defaultValue={getDefaultMovementDateForMonth(selectedMonth)}
                  required
                />
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

          <article className={styles.configCard}>
            <div className={styles.listTitle}>Registrar saida</div>
            <p className={styles.sectionSubtitle}>
              Informe o modelo, a cor, o tamanho, a quantidade, a origem e selecione o nome da arte. A baixa acontece na lisa.
              Informe a cor, o tamanho, a quantidade, a origem e selecione o nome da arte que saiu.
            </p>

            <form action={registerStockExitAction} className={styles.formStack}>
              <input type="hidden" name="redirectTo" value={redirectTo} />

              <label className={styles.filterField}>
                <span>Modelo</span>
                <select name="sku" required defaultValue={modelOptions[0] ?? ""}>
                  {modelOptions.length > 0 ? (
                    modelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhum modelo mapeado</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Cor</span>
                <select name="color" required defaultValue={colorOptions[0] ?? ""}>
                  {colorOptions.length > 0 ? (
                    colorOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhuma cor mapeada</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Tamanho</span>
                <select name="size" required defaultValue={sizeOptions[0] ?? ""}>
                  {sizeOptions.length > 0 ? (
                    sizeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                <span>Cor, tamanho e base</span>
                <select name="stockBaseKey" required defaultValue={combinedBaseOptions[0]?.key ?? ""}>
                  {combinedBaseOptions.length > 0 ? (
                    combinedBaseOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.color} · {option.size} · {option.sku} · saldo {option.plain}
                      </option>
                    ))
                  ) : (
                    <option value="">Nenhum tamanho mapeado</option>
                  )}
                </select>
              </label>

              <label className={styles.filterField}>
                <span>Nome da arte</span>
                <select name="artSelectionId" defaultValue="">
                  <option value="">Sem arte vinculada</option>
                  {namedArtOptions.map((option) => (
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
                <span>Data</span>
                <input
                  type="date"
                  name="movementDate"
                  defaultValue={getDefaultMovementDateForMonth(selectedMonth)}
                  required
                />
              </label>

              <label className={styles.filterField}>
                <span>Origem / referencia</span>
                <input type="text" name="originReference" placeholder="Ex.: #201" />
              </label>

              <label className={styles.checkboxCard}>
                <input type="checkbox" name="alreadyPrinted" value="true" />
                <span>
                  <strong>Ja estava estampado</strong>
                  <span>Registra a saida e a arte, mas nao baixa a lisa porque essa peca veio de outro lote ja estampado.</span>
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
            <div className={styles.sectionTitle}>Extrato de entrada e saida</div>
            <p className={styles.sectionSubtitle}>
              Cada movimentacao mostra a data, a origem, o numero de referencia, a arte e o saldo final daquela base depois do lancamento.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Tipo</th>
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
                  <td colSpan={10}>Nenhuma movimentacao de camisetas registrada neste mes.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
