"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import styles from "./panel.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type AuthUserMenuProps = {
  fullName: string;
  email: string;
};

export function AuthUserMenu({ fullName, email }: AuthUserMenuProps) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setIsSigningOut(true);

    try {
      const client = createSupabaseBrowserClient();
      await client.auth.signOut();
      router.replace("/login");
      router.refresh();
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className={styles.accountCard}>
      <div className={styles.accountMeta}>
        <strong>{fullName}</strong>
        <span>{email}</span>
      </div>
      <Link href="/perfil" className={styles.secondaryButton}>
        Perfil
      </Link>
      <button
        type="button"
        className={styles.secondaryButton}
        onClick={handleSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? "Saindo..." : "Sair"}
      </button>
    </div>
  );
}
