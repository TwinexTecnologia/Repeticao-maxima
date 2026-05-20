import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import styles from "./panel.module.css";

type AppShellProps = {
  title: string;
  subtitle: string;
  currentPath: string;
  children: ReactNode;
};

const navigationItems = [
  { href: "/", label: "Dashboard", hint: "Caixa e alertas" },
  { href: "/compras", label: "Compras", hint: "Lotes e dividas" },
  { href: "/estoque", label: "Estoque", hint: "Base por cor" },
  { href: "/pedidos", label: "Pedidos", hint: "Venda e producao" },
  { href: "/financeiro", label: "Financeiro", hint: "Margem liquida" },
  {
    href: "/integracoes/nuvemshop",
    label: "Nuvemshop",
    hint: "Pedidos reais",
  },
  {
    href: "/influenciadores",
    label: "Influenciadores",
    hint: "Cupons e brindes",
  },
  { href: "/empresa", label: "Empresa", hint: "Dados e regras" },
];

export function AppShell({
  title,
  subtitle,
  currentPath,
  children,
}: AppShellProps) {
  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandCard}>
          <div className={styles.brandLogoWrap}>
            <Image
              src="/logo-rm-placeholder.svg"
              alt="Logo Repeticao Maxima"
              width={220}
              height={88}
              className={styles.brandLogo}
              priority
            />
          </div>
        </div>

        <nav className={styles.nav} aria-label="Principal">
          {navigationItems.map((item) => {
            const isActive = currentPath === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${
                  isActive ? styles.navLinkActive : ""
                }`}
              >
                <span>{item.label}</span>
                <span className={styles.navHint}>{item.hint}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.titleBlock}>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
