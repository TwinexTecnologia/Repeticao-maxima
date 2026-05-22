"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import styles from "@/components/panel.module.css";

type PartnerPerformanceClientProps = {
  selectedMonth: string;
  canRequestClothes: boolean;
  canRequestSupport: boolean;
  clothesAvailable: string;
  supportAvailable: string;
  partnerRole: "influenciador" | "atleta";
};

type PartnerRequestResponse = {
  ok: boolean;
  message?: string;
};

export function PartnerPerformanceClient({
  selectedMonth,
  canRequestClothes,
  canRequestSupport,
  clothesAvailable,
  supportAvailable,
  partnerRole,
}: PartnerPerformanceClientProps) {
  const router = useRouter();
  const [supportGoal, setSupportGoal] = useState("Pintura");
  const [feedback, setFeedback] = useState("");
  const [isSubmittingClothes, setIsSubmittingClothes] = useState(false);
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);

  async function handleRequest(requestType: "roupa" | "apoio") {
    if (requestType === "roupa") {
      setIsSubmittingClothes(true);
    } else {
      setIsSubmittingSupport(true);
    }

    setFeedback("");

    try {
      const response = await fetch("/api/parceiro/solicitacoes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          selectedMonth,
          requestType,
          supportGoal,
        }),
      });
      const result = (await response.json()) as PartnerRequestResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Nao foi possivel enviar sua solicitacao.");
      }

      setFeedback(result.message || "Solicitacao enviada com sucesso.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar sua solicitacao.",
      );
    } finally {
      setIsSubmittingClothes(false);
      setIsSubmittingSupport(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>Solicitar resgate</div>
          <p className={styles.sectionSubtitle}>
            Quando voce solicita, o admin recebe seu pedido para gerar o cupom
            de roupa ou liberar o apoio esportivo.
          </p>
        </div>
      </div>

      <div className={styles.twoColumn}>
        <article className={styles.catalogCard}>
          <div className={styles.listTitle}>Resgate em roupa</div>
          <p className={styles.sectionSubtitle}>
            Saldo livre nesta janela: <strong>{clothesAvailable}</strong>
          </p>
          <div className={styles.filterActions} style={{ marginTop: 16 }}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => handleRequest("roupa")}
              disabled={!canRequestClothes || isSubmittingClothes}
            >
              {isSubmittingClothes ? "Enviando..." : "Solicitar roupa"}
            </button>
          </div>
        </article>

        {partnerRole === "atleta" ? (
          <article className={styles.catalogCard}>
            <div className={styles.listTitle}>Apoio esportivo</div>
            <p className={styles.sectionSubtitle}>
              Saldo livre para pintura, kit ou ajuda: <strong>{supportAvailable}</strong>
            </p>
            <label className={styles.filterField} style={{ marginTop: 16 }}>
              <span>Destino do apoio</span>
              <select
                value={supportGoal}
                onChange={(event) => setSupportGoal(event.target.value)}
              >
                <option value="Pintura">Pintura</option>
                <option value="Kit atleta">Kit atleta</option>
                <option value="Inscricao">Inscricao</option>
                <option value="Outro apoio">Outro apoio</option>
              </select>
            </label>
            <div className={styles.filterActions} style={{ marginTop: 16 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => handleRequest("apoio")}
                disabled={!canRequestSupport || isSubmittingSupport}
              >
                {isSubmittingSupport ? "Enviando..." : "Solicitar apoio"}
              </button>
            </div>
          </article>
        ) : null}
      </div>

      {feedback ? (
        <div className={styles.callout} style={{ marginTop: 18 }}>
          <h3>Status da solicitacao</h3>
          <p>{feedback}</p>
        </div>
      ) : null}
    </section>
  );
}
