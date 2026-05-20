import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { employeeAccessMetrics, employeeRows } from "@/lib/mock-data";

export default function FuncionariosPage() {
  return (
    <AppShell
      title="Funcionarios e permissoes"
      subtitle="Cadastre a equipe e defina exatamente quais modulos cada pessoa pode visualizar ou administrar."
      currentPath="/funcionarios"
    >
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Controle de acesso</div>
            <p className={styles.sectionSubtitle}>
              Base para voce separar quem pode ver pedidos, financeiro,
              influenciadores, simulador e configuracoes da equipe.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {employeeAccessMetrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <div>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Equipe cadastrada</div>
                <p className={styles.sectionSubtitle}>
                  Cada funcionario pode ter um perfil diferente com acesso so ao
                  que faz sentido para a funcao dele.
                </p>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Funcao</th>
                    <th>Modulos liberados</th>
                    <th>Restricoes</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employeeRows.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{row.role}</td>
                      <td>{row.access.join(", ")}</td>
                      <td>{row.restrictions}</td>
                      <td>{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className={styles.stack}>
            <div className={styles.callout}>
              <h3>Exemplo de regra</h3>
              <p>
                A operacao pode ver pedidos e influenciadores, mas nao acessa o
                financeiro. Ja o administrador pode visualizar tudo.
              </p>
            </div>

            <div className={styles.callout}>
              <h3>Expansao natural</h3>
              <p>
                Na proxima etapa, esse modulo pode virar cadastro real com
                checkbox por tela, perfil pronto e bloqueio automatico no menu.
              </p>
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
