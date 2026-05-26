import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { PartnerRedemptionManager } from "@/components/partner-redemption-manager";
import {
  formatDateTime,
  formatMoney,
  getCurrentMonthInput,
  getRollingWindowRange,
} from "@/lib/parceiros/performance";
import { loadStockSelectionOptions, loadSiteArtSelectionOptions } from "@/lib/operacoes/repository";
import { loadCouponPartnerModuleData } from "@/lib/parceiros/repository";
import { loadInfluenciadoresDashboard } from "@/lib/parceiros/influenciadores-dashboard";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getSearchValue(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] || "" : value || "";
}

export default async function PoupancaAtletaPage({ searchParams }: PageProps) {
  const resolvedSearchParams = (await searchParams) || {};
  const selectedMonth =
    getSearchValue(resolvedSearchParams, "month") || getCurrentMonthInput();
  const rollingWindow = getRollingWindowRange(selectedMonth);

  const [moduleData, stockOptions, artOptions] = await Promise.all([
    loadCouponPartnerModuleData(),
    loadStockSelectionOptions(),
    loadSiteArtSelectionOptions(),
  ]);

  const dashboard = await loadInfluenciadoresDashboard(
    {
      startDate: rollingWindow.startDate,
      endDate: rollingWindow.endDate,
      couponQuery: "",
      selectedCoupon: "",
    },
    moduleData.profiles,
  );

  return (
    <AppShell
      title="Poupanca do atleta"
      subtitle="Veja o saldo acumulado de apoio dos atletas e registre resgates."
      currentPath="/influenciadores/poupanca-atleta"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Filtro</div>
            <p className={styles.sectionSubtitle}>
              Escolha o mes final da janela de 3 meses para calcular a poupanca.
            </p>
          </div>
        </div>

        <form className={styles.filterGrid} method="get">
          <label className={styles.filterField}>
            <span>Mes final da janela</span>
            <input type="month" name="month" defaultValue={selectedMonth} />
          </label>
          <div className={styles.filterActions}>
            <button type="submit" className={styles.primaryButton}>
              Aplicar
            </button>
            <a href="/influenciadores/poupanca-atleta" className={styles.secondaryButton}>
              Limpar
            </a>
          </div>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Poupanca por atleta</div>
            <p className={styles.sectionSubtitle}>
              Base: {rollingWindow.label}. Aqui aparece o saldo acumulado e o quanto falta para o
              proximo marco.
            </p>
          </div>
        </div>

        {!dashboard.ok ? (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Erro ao carregar</div>
            <p className={styles.warningText}>{dashboard.message}</p>
          </div>
        ) : dashboard.data.athleteRows.length > 0 ? (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Atleta</th>
                  <th>Cupom</th>
                  <th>Saldo de apoio</th>
                  <th>Falta para o proximo</th>
                  <th>Ultimo pedido</th>
                  <th>Atalho</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.data.athleteRows.map((row) => (
                  <tr key={row.code}>
                    <td>{row.name}</td>
                    <td>{row.code}</td>
                    <td>{formatMoney(row.cumulativeSupport)}</td>
                    <td>{row.nextSupportMilestone !== null ? formatMoney(row.nextSupportMilestone) : "-"}</td>
                    <td>{formatDateTime(row.lastOrderAt)}</td>
                    <td>
                      <a
                        href={`/influenciadores?selectedCoupon=${encodeURIComponent(row.code)}`}
                        className={styles.secondaryButton}
                      >
                        Ver parceiro
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={styles.emptyState}>Nenhum atleta ativo encontrado.</div>
        )}
      </section>

      <PartnerRedemptionManager
        initialProfiles={moduleData.profiles}
        initialRedemptions={moduleData.redemptions}
        initialPersistence={moduleData.redemptionState}
        stockOptions={stockOptions}
        artOptions={artOptions}
        selectedCouponCode=""
      />
    </AppShell>
  );
}
