"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type { PartnerRewardRequest } from "@/lib/parceiros/repository";

type PartnerPerformanceClientProps = {
  selectedMonth: string;
  canRequestClothes: boolean;
  canRequestSupport: boolean;
  clothesAvailable: string;
  supportAvailable: string;
  partnerRole: "influenciador" | "atleta";
  approvedClothesRequests: PartnerRewardRequest[];
  hasOpenClothesRequest: boolean;
  openClothesRequestStatus: "pendente" | "aprovado" | null;
};

type PartnerRequestResponse = {
  ok: boolean;
  message?: string;
};

type PartnerStoreRedirectResponse = {
  ok: boolean;
  message?: string;
  redirectUrl?: string;
};

export function PartnerPerformanceClient({
  selectedMonth,
  canRequestClothes,
  canRequestSupport,
  clothesAvailable,
  supportAvailable,
  partnerRole,
  approvedClothesRequests,
  hasOpenClothesRequest,
  openClothesRequestStatus,
}: PartnerPerformanceClientProps) {
  const router = useRouter();
  const [supportGoal, setSupportGoal] = useState("Pintura");
  const [requestFeedback, setRequestFeedback] = useState("");
  const [storeFeedback, setStoreFeedback] = useState("");
  const [isSubmittingClothes, setIsSubmittingClothes] = useState(false);
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [isRedirectingToStore, setIsRedirectingToStore] = useState(false);
  const [selectedApprovedRequestId, setSelectedApprovedRequestId] = useState(
    approvedClothesRequests[0]?.id || "",
  );
  const selectedApprovedRequest = useMemo(
    () =>
      approvedClothesRequests.find((item) => item.id === selectedApprovedRequestId) ||
      approvedClothesRequests[0] ||
      null,
    [approvedClothesRequests, selectedApprovedRequestId],
  );
  const approvedAmount = selectedApprovedRequest
    ? Math.max(selectedApprovedRequest.requestedAmount - selectedApprovedRequest.consumedAmount, 0)
    : 0;

  useEffect(() => {
    if (!approvedClothesRequests.some((item) => item.id === selectedApprovedRequestId)) {
      setSelectedApprovedRequestId(approvedClothesRequests[0]?.id || "");
    }
  }, [approvedClothesRequests, selectedApprovedRequestId]);

  async function handleRequest(requestType: "roupa" | "apoio") {
    if (requestType === "roupa") {
      setIsSubmittingClothes(true);
    } else {
      setIsSubmittingSupport(true);
    }

    setRequestFeedback("");

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

      setRequestFeedback(result.message || "Solicitacao enviada com sucesso.");
      router.refresh();
    } catch (error) {
      setRequestFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel enviar sua solicitacao.",
      );
    } finally {
      setIsSubmittingClothes(false);
      setIsSubmittingSupport(false);
    }
  }

  async function handleOpenStoreWithBalance() {
    if (!selectedApprovedRequest) {
      setStoreFeedback("Selecione uma aprovacao de roupa para usar na loja.");
      return;
    }

    setIsRedirectingToStore(true);
    setStoreFeedback("");

    try {
      const response = await fetch("/api/parceiro/loja", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: selectedApprovedRequest.id,
        }),
      });
      const result = (await response.json()) as PartnerStoreRedirectResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Nao foi possivel abrir a loja com saldo.");
      }

      if (!result.redirectUrl) {
        throw new Error("A sessao foi criada, mas a URL da loja nao voltou corretamente.");
      }

      window.location.href = result.redirectUrl;
    } catch (error) {
      setStoreFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel abrir a loja com saldo.",
      );
    } finally {
      setIsRedirectingToStore(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.mobileOnly}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>🎁 Saldo disponivel</div>
            <p className={styles.sectionSubtitle}>Quando liberar, solicite aqui.</p>
          </div>
        </div>

        <article className={styles.heroCard}>
          <div className={styles.mobileCardLabel}>Saldo em roupa</div>
          <div className={styles.mobileCardValue} style={{ fontSize: "1.55rem" }}>
            {clothesAvailable}
          </div>
          <div className={styles.mobileCardHint}>
            O saldo so diminui conforme voce realmente usa no resgate.
          </div>

          <div className={styles.filterActions} style={{ marginTop: 14 }}>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => handleRequest("roupa")}
              disabled={!canRequestClothes || isSubmittingClothes}
            >
              {isSubmittingClothes ? "Enviando..." : "Solicitar resgate"}
            </button>
          </div>

          {!canRequestClothes ? (
            <div className={styles.callout} style={{ marginTop: 12 }}>
              <h3>{hasOpenClothesRequest ? "Solicitacao em andamento" : "Saldo bloqueado"}</h3>
              <p>
                {hasOpenClothesRequest
                  ? openClothesRequestStatus === "pendente"
                    ? "Seu pedido ja foi enviado para o admin. O saldo continua guardado para voce."
                    : "Seu saldo ja foi aprovado. Agora voce pode entrar na loja real e comprar por la."
                  : "Bata a meta para liberar saldo."}
              </p>
            </div>
          ) : null}

          {partnerRole === "atleta" ? (
            <div style={{ marginTop: 14 }}>
              <div className={styles.mobileCardLabel}>Saldo de apoio</div>
              <div className={styles.mobileCardValue}>{supportAvailable}</div>
              <label className={styles.filterField} style={{ marginTop: 12 }}>
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
              <div className={styles.filterActions} style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => handleRequest("apoio")}
                  disabled={!canRequestSupport || isSubmittingSupport}
                >
                  {isSubmittingSupport ? "Enviando..." : "Solicitar apoio"}
                </button>
              </div>
              {!canRequestSupport ? (
                <div className={styles.callout} style={{ marginTop: 12 }}>
                  <h3>Apoio indisponivel</h3>
                  <p>Acumule saldo suficiente para solicitar o apoio.</p>
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      </div>

      <div className={styles.desktopOnly}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Solicitar resgate</div>
            <p className={styles.sectionSubtitle}>
              Quando voce solicita, o admin libera seu saldo de roupa ou o apoio esportivo.
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
      </div>

      {requestFeedback ? (
        <div className={styles.callout} style={{ marginTop: 18 }}>
          <h3>Status da solicitacao</h3>
          <p>{requestFeedback}</p>
        </div>
      ) : null}

      {approvedClothesRequests.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Usar saldo na loja</div>
              <p className={styles.sectionSubtitle}>
                Abra a loja real com seu saldo pronto para o checkout. Assim voce aproveita
                combos, frete, meios de pagamento e o catalogo normal do site.
              </p>
            </div>
            <div className={styles.chipRow}>
              <span className={styles.chip}>
                {approvedClothesRequests.length} aprovacao(oes) pronta(s)
              </span>
            </div>
          </div>

          <div className={styles.twoColumn}>
            <article className={styles.catalogCard}>
              <label className={styles.filterField}>
                <span>Saldo aprovado</span>
                <select
                  value={selectedApprovedRequestId}
                  onChange={(event) => setSelectedApprovedRequestId(event.target.value)}
                >
                  {approvedClothesRequests.map((request) => (
                    <option key={request.id} value={request.id}>
                      {`${formatMoney(
                        Math.max(request.requestedAmount - request.consumedAmount, 0),
                      )} restantes · ${formatDate(request.requestedAt)}${
                        request.windowEndDate ? ` · janela ate ${request.windowEndDate}` : ""
                      }`}
                    </option>
                  ))}
                </select>
              </label>

              <div className={styles.chipRow} style={{ marginTop: 16 }}>
                <span className={styles.chip}>
                  Saldo liberado: <strong>{selectedApprovedRequest ? formatMoney(approvedAmount) : "-"}</strong>
                </span>
                <span className={styles.chip}>
                  Meta: <strong>{selectedApprovedRequest?.windowEndDate || "saldo reaproveitavel"}</strong>
                </span>
              </div>

              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>Como funciona agora</h3>
                <p>
                  O painel so prepara seu saldo. A compra acontece dentro da loja real, com o
                  mesmo checkout, promocoes e formas de pagamento do site.
                </p>
              </div>
            </article>

            <article className={styles.catalogCard}>
              <div className={styles.listTitle}>Resumo do saldo</div>
              <div className={styles.redemptionSummaryGrid} style={{ marginTop: 16 }}>
                <div className={styles.redemptionSummaryCard}>
                  <span>Saldo aprovado</span>
                  <strong>{selectedApprovedRequest ? formatMoney(approvedAmount) : "-"}</strong>
                </div>
                <div className={styles.redemptionSummaryCard}>
                  <span>Compra</span>
                  <strong>Na loja real</strong>
                </div>
                <div className={styles.redemptionSummaryCard}>
                  <span>Combos e frete</span>
                  <strong>Ativos</strong>
                </div>
                <div className={`${styles.redemptionSummaryCard} ${styles.redemptionSummaryCardSuccess}`}>
                  <span>Baixa do saldo</span>
                  <strong>So quando pagar</strong>
                </div>
              </div>

              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>O que acontece no checkout</h3>
                <p>
                  Seu saldo entra como desconto dinamico da propria loja. O restante, se houver,
                  continua disponivel para um proximo pedido.
                </p>
              </div>

              <div className={styles.filterActions} style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleOpenStoreWithBalance}
                  disabled={!selectedApprovedRequest || isRedirectingToStore}
                >
                  {isRedirectingToStore ? "Abrindo loja..." : "Ir para a loja usar saldo"}
                </button>
              </div>
            </article>
          </div>

          {storeFeedback ? (
            <div className={styles.callout} style={{ marginTop: 18 }}>
              <h3>Status da loja</h3>
              <p>{storeFeedback}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}
