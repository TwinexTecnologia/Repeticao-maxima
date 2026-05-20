import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { orderRows, ordersOverview, stockAlerts } from "@/lib/mock-data";

export default function PedidosPage() {
  return (
    <AppShell
      title="Pedidos e producao"
      subtitle="Acompanhe o que entrou por plataforma, quais variacoes estao saindo e o que precisa andar na estampa."
      currentPath="/pedidos"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo do dia</div>
            <p className={styles.sectionSubtitle}>
              Leitura rapida do fluxo entre venda, fila de producao e preparacao
              para envio.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Periodo: Hoje</span>
            <span className={styles.chip}>Filtro: Todos os canais</span>
            <span className={styles.chip}>Status: Ativos</span>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {ordersOverview.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Pedidos recentes</div>
            <p className={styles.sectionSubtitle}>
              Cada pedido ja aparece com canal, arte, variacao, influenciador e
              margem estimada.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Origem</th>
                <th>Produto</th>
                <th>Variacao</th>
                <th>Arte</th>
                <th>Influenciador</th>
                <th>Status</th>
                <th>Total</th>
                <th>Margem</th>
              </tr>
            </thead>
            <tbody>
              {orderRows.map((row) => (
                <tr key={row.id}>
                  <td>{row.id}</td>
                  <td>{row.origin}</td>
                  <td>{row.product}</td>
                  <td>{row.variant}</td>
                  <td>{row.art}</td>
                  <td>{row.influencer}</td>
                  <td>{row.status}</td>
                  <td>{row.total}</td>
                  <td className={styles.profitPositive}>{row.margin}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className={styles.footerNote}>
          Proximo passo natural: conectar essa grade com importacao real da
          Nuvem Shop e do TikTok Shop.
        </p>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.stack}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Fila de producao</div>
                <p className={styles.sectionSubtitle}>
                  Vista inicial do que precisa ser estampado primeiro.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              <article className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>Oversized preta / M</div>
                  <span className={`${styles.pill} ${styles.pillMedium}`}>
                    11 pecas
                  </span>
                </div>
                <p className={styles.listDetail}>
                  Arte principal: RM Power. Prazo ideal de saida: ate amanha.
                </p>
              </article>

              <article className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>Baby Tee branca / P</div>
                  <span className={`${styles.pill} ${styles.pillHigh}`}>
                    8 pecas
                  </span>
                </div>
                <p className={styles.listDetail}>
                  Alta concentracao vinda do TikTok Shop com influenciadores.
                </p>
              </article>

              <article className={styles.listItem}>
                <div className={styles.listTitleRow}>
                  <div className={styles.listTitle}>Regata Dry branca / G</div>
                  <span className={`${styles.pill} ${styles.pillLow}`}>
                    4 pecas
                  </span>
                </div>
                <p className={styles.listDetail}>
                  Pode entrar junto com a proxima batelada sem travar o fluxo.
                </p>
              </article>
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Risco operacional</div>
                <p className={styles.sectionSubtitle}>
                  Alertas cruzando pedidos e disponibilidade.
                </p>
              </div>
            </div>

            <div className={styles.list}>
              {stockAlerts.map((alert) => {
                const pillClass =
                  alert.level === "alto"
                    ? styles.pillHigh
                    : alert.level === "medio"
                      ? styles.pillMedium
                      : styles.pillLow;

                return (
                  <article key={alert.title} className={styles.listItem}>
                    <div className={styles.listTitleRow}>
                      <div className={styles.listTitle}>{alert.title}</div>
                      <span className={`${styles.pill} ${pillClass}`}>
                        {alert.level}
                      </span>
                    </div>
                    <p className={styles.listDetail}>{alert.detail}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
