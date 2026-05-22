import { AppShell } from "@/components/app-shell";
import styles from "@/components/panel.module.css";

export default function UsuariosPage() {
  return (
    <AppShell
      title="Usuarios"
      subtitle="Essa area fica reservada para o futuro controle de acesso do sistema."
      currentPath="/usuarios"
    >
      <section className={styles.section}>
        <div className={styles.callout}>
          <h3>Controle de acesso</h3>
          <p>
            A classificacao de cupons, influenciadores e atletas agora fica toda
            dentro da aba de `Influenciadores`. Esta tela foi liberada para no
            futuro controlar quem pode acessar e operar o sistema.
          </p>
        </div>
      </section>
    </AppShell>
  );
}
