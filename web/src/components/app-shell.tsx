import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { AuthUserMenu } from "./auth-user-menu";
import styles from "./panel.module.css";
import {
  APP_NAVIGATION_ITEMS,
  isNavigationItemActive,
  requirePageAccess,
  type AppNavigationItem,
} from "@/lib/auth/access";

type AppShellProps = {
  title: string;
  subtitle: string;
  currentPath: string;
  children: ReactNode;
};

export async function AppShell({
  title,
  subtitle,
  currentPath,
  children,
}: AppShellProps) {
  const { user, navigationItems } = await requirePageAccess(currentPath);
  const isPartner = user.userType === "parceiro";
  const isPartnerHome =
    currentPath.startsWith("/meu-desempenho") &&
    (!currentPath.includes("tab=") || currentPath.includes("tab=inicio"));
  const isPartnerCampaigns = currentPath.includes("tab=campanhas");
  const isPartnerOrders = currentPath.includes("tab=pedidos");
  const isPartnerRedemptions = currentPath.includes("tab=resgates");

  return (
    <div className={styles.appShell}>
      <aside className={styles.sidebar}>
        <div className={styles.brandCard}>
          <div className={styles.brandLogoWrap}>
            <Image
              src="/logo-repeticao-maxima.png"
              alt="Logo Repeticao Maxima"
              width={108}
              height={108}
              className={styles.brandLogo}
              priority
            />
          </div>
          <div className={styles.brandName}>Repeticao Maxima</div>
        </div>

        <nav className={styles.nav} aria-label="Principal">
          {navigationItems.map((item) => {
            const isActive = isNavigationItemActive(currentPath, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${
                  isActive ? styles.navLinkActive : ""
                }`}
              >
                <span className={styles.navIconWrap} aria-hidden="true">
                  <NavigationIcon icon={item.icon} />
                </span>
                <span className={styles.navCopy}>
                  <span className={styles.navLabel}>{item.label}</span>
                  <span className={styles.navHint}>{item.hint}</span>
                </span>
                <span className={styles.navArrow} aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none">
                    <path
                      d="M7.5 4.5L13 10L7.5 15.5"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.mobileTopBrand}>
            <Image
              src="/logo-repeticao-maxima.png"
              alt="Logo Repeticao Maxima"
              width={38}
              height={38}
              className={styles.mobileTopLogo}
            />
            <div className={styles.mobileTopBrandName}>Repeticao Maxima</div>
          </div>
          <div className={styles.titleBlock}>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          <AuthUserMenu fullName={user.fullName} email={user.email} />
        </header>

        {!isPartner && navigationItems.length > 0 ? (
          <nav className={styles.mobileModuleNav} aria-label="Modulos liberados">
            {navigationItems.map((item) => {
              const isActive = isNavigationItemActive(currentPath, item.href);

              return (
                <Link
                  key={`mobile-${item.href}`}
                  href={item.href}
                  className={`${styles.mobileModuleLink} ${
                    isActive ? styles.mobileModuleLinkActive : ""
                  }`}
                >
                  <span className={styles.mobileModuleIcon} aria-hidden="true">
                    <NavigationIcon icon={item.icon} />
                  </span>
                  <span className={styles.mobileModuleCopy}>
                    <strong>{item.label}</strong>
                    <span>{item.hint}</span>
                  </span>
                  <span className={styles.navArrow} aria-hidden="true">
                    <svg viewBox="0 0 20 20" fill="none">
                      <path
                        d="M7.5 4.5L13 10L7.5 15.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </Link>
              );
            })}
          </nav>
        ) : null}

        {children}
      </div>

      {isPartner ? (
        <nav className={styles.mobileTabBar} aria-label="Navegacao">
          <Link
            href="/meu-desempenho"
            className={`${styles.mobileTabBarLink} ${
              isPartnerHome ? styles.mobileTabBarLinkActive : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 10.5L12 4.5L20 10.5V20H15V14H9V20H4V10.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
            </svg>
            <span>Inicio</span>
          </Link>
          <Link
            href="/meu-desempenho?tab=campanhas"
            className={`${styles.mobileTabBarLink} ${
              isPartnerCampaigns ? styles.mobileTabBarLinkActive : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M7 5.5H17V9.5C17 11.7 15.2 13.5 13 13.5H11C8.8 13.5 7 11.7 7 9.5V5.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M9 20H15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M12 13.5V20"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>Campanhas</span>
          </Link>
          <Link
            href="/meu-desempenho?tab=pedidos"
            className={`${styles.mobileTabBarLink} ${
              isPartnerOrders ? styles.mobileTabBarLinkActive : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="3.5" width="12" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
              <path d="M9 8.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M9 12.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>Pedidos</span>
          </Link>
          <Link
            href="/meu-desempenho?tab=resgates"
            className={`${styles.mobileTabBarLink} ${
              isPartnerRedemptions ? styles.mobileTabBarLinkActive : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M6.5 9.5H17.5V20H6.5V9.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M6.5 9.5L9 4.5H15L17.5 9.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M12 9.5V20"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>Resgates</span>
          </Link>
          <Link
            href="/perfil"
            className={`${styles.mobileTabBarLink} ${
              currentPath.startsWith("/perfil") ? styles.mobileTabBarLinkActive : ""
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
              <path
                d="M5.2 19C6.5 16.3 9 15 12 15C15 15 17.5 16.3 18.8 19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            <span>Perfil</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}

function NavigationIcon({ icon }: { icon: AppNavigationItem["icon"] }) {
  switch (icon) {
    case "dashboard":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "compras":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 5H6.4L8.2 14H18.5L20.5 8H9.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="10.5" cy="18.5" r="1.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.5" cy="18.5" r="1.5" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case "estoque":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M12 3.5L20 7.8V16.2L12 20.5L4 16.2V7.8L12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M4.5 8L12 12L19.5 8" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 12V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "pedidos":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <rect x="5" y="3.5" width="14" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 3.5H15V6.5H9V3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M8.5 10H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M8.5 14H15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "financeiro":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M14.9 9.4C14.5 8.5 13.5 8 12.2 8C10.7 8 9.8 8.8 9.8 9.9C9.8 11 10.5 11.5 12.4 12C14.2 12.4 15 13.1 15 14.4C15 15.8 13.8 16.8 12 16.8C10.4 16.8 9.2 16.1 8.7 14.9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M12 7V17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "nuvemshop":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M8.5 18.5H17C19.2 18.5 21 16.8 21 14.6C21 12.6 19.6 11 17.6 10.7C17.1 7.9 14.8 6 12 6C9.6 6 7.5 7.4 6.6 9.5C4.6 9.7 3 11.3 3 13.4C3 16.2 5.3 18.5 8.1 18.5H8.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "influenciadores":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="10" cy="9" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.8 18.2C5.8 15.7 7.8 14.5 10 14.5C12.2 14.5 14.2 15.7 15.2 18.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M17.8 8.2V13.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M15 11H20.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "empresa":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M6 20V5.5C6 4.9 6.4 4.5 7 4.5H17C17.6 4.5 18 4.9 18 5.5V20" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9 8H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.5 8H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M9 11.5H10.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M13.5 11.5H15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M10 20V16.5H14V20" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case "usuarios":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="8.5" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M4.8 17.8C5.7 15.8 7.3 14.8 9 14.8C10.7 14.8 12.3 15.8 13.2 17.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M16.5 8.2H20.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M18.5 6.2V10.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
  }
}
