import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { simulationScenarios } from "@/lib/mock-data";

export default function SimuladorPage() {
  return (
    <AppShell
      title="Simulador de preco"
      subtitle="Teste cenarios de taxa, parcelamento e frete para descobrir se o valor da peca esta saudavel antes de aplicar no site."
      currentPath="/simulador"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Como esse simulador ajuda</div>
            <p className={styles.sectionSubtitle}>
              A leitura abaixo transforma precificacao em decisao pratica para
              nao vender muito e lucrar pouco.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Preco alvo</span>
            <span className={styles.chip}>Margem minima</span>
            <span className={styles.chip}>Frete gratis</span>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroCard}>
            <h2>O simulador precisa responder a pergunta certa.</h2>
            <p>
              Em vez de olhar so o valor vendido, o sistema cruza custo da peca,
              taxa da plataforma, custo de frete, comissao e parcelamento para
              mostrar o lucro real por pedido.
            </p>
            <div className={styles.heroBulletList}>
              <div className={styles.heroBullet}>
                <span>01</span>
                <span>Quanto sobra vendendo no Pix ou no cartao.</span>
              </div>
              <div className={styles.heroBullet}>
                <span>02</span>
                <span>Quando o frete gratis comeca a machucar a margem.</span>
              </div>
              <div className={styles.heroBullet}>
                <span>03</span>
                <span>Qual deve ser o novo preco para manter a meta.</span>
              </div>
            </div>
          </div>

          <div className={styles.stack}>
            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Margem minima desejada</div>
              <div className={styles.metricValue}>22%</div>
              <div className={styles.metricHint}>
                Regra base sugerida para nao crescer sem caixa.
              </div>
            </article>

            <article className={styles.metricCard}>
              <div className={styles.metricLabel}>Preco minimo sugerido</div>
              <div className={styles.metricValue}>R$ 154,90</div>
              <div className={styles.metricHint}>
                Para proteger frete gratis no TikTok Shop.
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Cenarios de simulacao</div>
            <p className={styles.sectionSubtitle}>
              Exemplos reais de como o modulo pode comparar composicoes de custo
              para a mesma peca.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {simulationScenarios.map((scenario) => (
            <article key={scenario.title} className={styles.metricCard}>
              <div className={styles.metricLabel}>{scenario.title}</div>
              <div className={styles.metricValue}>{scenario.salePrice}</div>

              <div className={styles.costList}>
                {scenario.costs.map((cost) => (
                  <div key={cost} className={styles.costLine}>
                    {cost}
                  </div>
                ))}
              </div>

              <div className={styles.metricHint}>{scenario.result}</div>
              <p className={styles.footerNote}>{scenario.recommendation}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div className={styles.callout}>
            <h3>Regras que valem virar automacao</h3>
            <p>
              Sempre que a margem liquida cair abaixo da meta, o sistema pode
              sinalizar que aquele preco precisa subir ou que a campanha precisa
              de ajustes.
            </p>
          </div>

          <div className={styles.callout}>
            <h3>Expansao natural</h3>
            <p>
              Na proxima etapa, esse modulo pode virar um formulario real com
              campos de preco, taxa, frete e comissao para calcular tudo na
              hora.
            </p>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
