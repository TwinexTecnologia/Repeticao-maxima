"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import styles from "./panel.module.css";

type NavigationIconName =
  | "dashboard"
  | "compras"
  | "estoque"
  | "pedidos"
  | "financeiro"
  | "nuvemshop"
  | "influenciadores"
  | "empresa"
  | "usuarios"
  | "perfil";

type MobileNavigationItem = {
  href: string;
  label: string;
  hint: string;
  icon: NavigationIconName;
};

type MobileAdminNavigationProps = {
  currentPath: string;
  navigationItems: MobileNavigationItem[];
  mobilePrimaryItems: MobileNavigationItem[];
};

export function MobileAdminNavigation({
  currentPath,
  navigationItems,
  mobilePrimaryItems,
}: MobileAdminNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setIsOpen(false);
  }, [currentPath]);

  function closeMenu() {
    setIsOpen(false);
  }

  return (
    <>
      <div className={styles.mobileAdminTopActions}>
        <button
          type="button"
          className={styles.mobileAdminSheetButton}
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="mobile-admin-sheet"
        >
          <span className={styles.mobileAdminSheetButtonIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M5 7H19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M5 12H19"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M5 17H13"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span>Modulos</span>
        </button>
      </div>

      <div
        className={`${styles.sheetOverlay} ${isOpen ? styles.sheetOverlayVisible : ""}`}
        aria-hidden="true"
        onClick={closeMenu}
      />

      <div
        id="mobile-admin-sheet"
        className={`${styles.sheetPanel} ${styles.mobileAdminSheet} ${
          isOpen ? styles.sheetPanelVisible : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-hidden={isOpen ? "false" : "true"}
      >
        <div className={styles.sheetHeader}>
          <div>
            <div className={styles.sheetTitle}>Modulos liberados</div>
            <div className={styles.sectionSubtitle}>
              Acesso rapido a tudo o que voce consegue operar pelo celular.
            </div>
          </div>
          <button
            type="button"
            className={styles.sheetClose}
            onClick={closeMenu}
            aria-label="Fechar menu"
          >
            Fechar
          </button>
        </div>

        <div className={styles.mobileAdminSheetGrid}>
          {navigationItems.map((item) => {
            const isActive = isNavigationItemActive(currentPath, item.href);

            return (
              <Link
                key={`mobile-sheet-${item.href}`}
                href={item.href}
                className={`${styles.mobileModuleLink} ${
                  isActive ? styles.mobileModuleLinkActive : ""
                }`}
                onClick={closeMenu}
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

          <Link
            href="/perfil"
            className={`${styles.mobileModuleLink} ${
              currentPath.startsWith("/perfil") ? styles.mobileModuleLinkActive : ""
            }`}
            onClick={closeMenu}
          >
            <span className={styles.mobileModuleIcon} aria-hidden="true">
              <NavigationIcon icon="perfil" />
            </span>
            <span className={styles.mobileModuleCopy}>
              <strong>Perfil</strong>
              <span>Conta, senha e acessos</span>
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
        </div>
      </div>

      <nav className={styles.mobileAdminBar} aria-label="Atalhos principais">
        {mobilePrimaryItems.map((item) => {
          const isActive = isNavigationItemActive(currentPath, item.href);

          return (
            <Link
              key={`mobile-primary-${item.href}`}
              href={item.href}
              className={`${styles.mobileAdminBarLink} ${
                isActive ? styles.mobileAdminBarLinkActive : ""
              }`}
            >
              <NavigationIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          className={styles.mobileAdminBarLink}
          onClick={() => setIsOpen(true)}
          aria-expanded={isOpen}
          aria-controls="mobile-admin-sheet"
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 12H6.01"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M12 12H12.01"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              d="M18 12H18.01"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          </svg>
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}

function isNavigationItemActive(currentPath: string, href: string) {
  if (
    (href === "/pedidos" || href === "/financeiro") &&
    (currentPath.startsWith("/pedidos") || currentPath.startsWith("/financeiro"))
  ) {
    return true;
  }

  return href === "/" ? currentPath === "/" : currentPath.startsWith(href);
}

function NavigationIcon({ icon }: { icon: NavigationIconName }) {
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
    case "perfil":
      return (
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="8.5" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M5.2 19C6.5 16.3 9 15 12 15C15 15 17.5 16.3 18.8 19"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}
