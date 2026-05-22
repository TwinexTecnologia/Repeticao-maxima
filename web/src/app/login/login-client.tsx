"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type LoginClientProps = {
  nextPath: string;
};

export function LoginClient({ nextPath }: LoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [feedback, setFeedback] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setFeedback("");

    try {
      const client = createSupabaseBrowserClient();
      const { error } = await client.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

      if (error) {
        throw error;
      }

      router.replace(nextPath);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel entrar no sistema.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.authPage}>
      <form className={styles.authCard} onSubmit={handleSubmit}>
        <div className={styles.brandCard}>
          <div className={styles.brandName}>Repeticao Maxima</div>
        </div>

        <div className={styles.titleBlock}>
          <h1>Entrar</h1>
          <p>
            Use o login criado na area de usuarios para acessar o painel interno.
          </p>
        </div>

        <div className={styles.formStack}>
          <label className={styles.filterField}>
            <span>E-mail</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>
          <label className={styles.filterField}>
            <span>Senha</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </label>
        </div>

        {feedback ? (
          <div className={styles.warningPanel}>
            <div className={styles.warningTitle}>Nao foi possivel entrar</div>
            <p className={styles.warningText}>{feedback}</p>
          </div>
        ) : null}

        <div className={styles.filterActions}>
          <button type="submit" className={styles.primaryButton} disabled={isSubmitting}>
            {isSubmitting ? "Entrando..." : "Entrar no sistema"}
          </button>
        </div>
      </form>
    </div>
  );
}
