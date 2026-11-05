import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";
import { loadAuthenticatedAppUser } from "@/lib/auth/access";

export default async function AcessoNegadoPage() {
  const user = await loadAuthenticatedAppUser();

  return (
    <AppShell
      title="Acesso negado"
      subtitle="Seu login esta autenticado, mas esse usuario nao tem permissao para usar essa area do sistema."
      currentPath="/acesso-negado"
    >
      <section className={styles.section}>
        <div className={styles.warningPanel}>
          <div className={styles.warningTitle}>Sem permissao nesse modulo</div>
          <p className={styles.warningText}>
            {user?.fullName || "Seu usuario"} nao tem menu liberado para essa tela.
            Se isso estiver errado, ajuste as permissoes na aba de usuarios.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
