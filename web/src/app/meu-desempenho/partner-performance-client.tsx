"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type { StoreProductSelectionOption } from "@/lib/operacoes/repository";
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
  redeemableStoreOptions: StoreProductSelectionOption[];
};

type PartnerRequestResponse = {
  ok: boolean;
  message?: string;
};

type PartnerRedemptionResponse = {
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
  approvedClothesRequests,
  hasOpenClothesRequest,
  openClothesRequestStatus,
  redeemableStoreOptions,
}: PartnerPerformanceClientProps) {
  const router = useRouter();
  const [supportGoal, setSupportGoal] = useState("Pintura");
  const [requestFeedback, setRequestFeedback] = useState("");
  const [redemptionFeedback, setRedemptionFeedback] = useState("");
  const [isSubmittingClothes, setIsSubmittingClothes] = useState(false);
  const [isSubmittingSupport, setIsSubmittingSupport] = useState(false);
  const [isSubmittingRedemption, setIsSubmittingRedemption] = useState(false);
  const [selectedApprovedRequestId, setSelectedApprovedRequestId] = useState(
    approvedClothesRequests[0]?.id || "",
  );
  const [selectedProductSelectionId, setSelectedProductSelectionId] = useState(
    redeemableStoreOptions[0]?.id || "",
  );
  const [redemptionQuantity, setRedemptionQuantity] = useState("1");
  const selectedApprovedRequest = useMemo(
    () =>
      approvedClothesRequests.find((item) => item.id === selectedApprovedRequestId) ||
      approvedClothesRequests[0] ||
      null,
    [approvedClothesRequests, selectedApprovedRequestId],
  );
  const selectedProduct = useMemo(
    () =>
      redeemableStoreOptions.find((item) => item.id === selectedProductSelectionId) ||
      redeemableStoreOptions[0] ||
      null,
    [redeemableStoreOptions, selectedProductSelectionId],
  );
  const approvedQuantity = Math.max(1, Math.trunc(Number(redemptionQuantity || "1") || 1));
  const selectedTotal = Math.round((selectedProduct?.unitPrice || 0) * approvedQuantity * 100) / 100;
  const approvedAmount = selectedApprovedRequest
    ? Math.max(selectedApprovedRequest.requestedAmount - selectedApprovedRequest.consumedAmount, 0)
    : 0;
  const remainingAfterSelection = Math.round((approvedAmount - selectedTotal) * 100) / 100;
  const exceedsApprovedAmount = remainingAfterSelection < 0;

  useEffect(() => {
    if (!approvedClothesRequests.some((item) => item.id === selectedApprovedRequestId)) {
      setSelectedApprovedRequestId(approvedClothesRequests[0]?.id || "");
    }
  }, [approvedClothesRequests, selectedApprovedRequestId]);

  useEffect(() => {
    if (!redeemableStoreOptions.some((item) => item.id === selectedProductSelectionId)) {
      setSelectedProductSelectionId(redeemableStoreOptions[0]?.id || "");
    }
  }, [redeemableStoreOptions, selectedProductSelectionId]);

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

  async function handleRedeemInsidePlatform() {
    if (!selectedApprovedRequest) {
      setRedemptionFeedback("Selecione uma aprovacao de roupa para usar nesse resgate.");
      return;
    }

    if (!selectedProduct) {
      setRedemptionFeedback("Selecione um produto da loja para registrar o resgate.");
      return;
    }

    setIsSubmittingRedemption(true);
    setRedemptionFeedback("");

    try {
      const response = await fetch("/api/parceiro/resgates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestId: selectedApprovedRequest.id,
          productSelectionId: selectedProduct.id,
          quantity: approvedQuantity,
        }),
      });
      const result = (await response.json()) as PartnerRedemptionResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Nao foi possivel registrar esse resgate.");
      }

      setRedemptionFeedback(
        result.message || "Resgate registrado com sucesso no seu historico.",
      );
      setRedemptionQuantity("1");
      router.refresh();
    } catch (error) {
      setRedemptionFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel registrar esse resgate.",
      );
    } finally {
      setIsSubmittingRedemption(false);
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
                    : "Seu saldo ja foi aprovado. Agora e so escolher o produto e registrar o resgate."
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
              <div className={styles.sectionTitle}>Resgatar na plataforma</div>
              <p className={styles.sectionSubtitle}>
                Escolha o produto com o preco normal da loja. Quando confirmar, isso entra no
                seu historico e tambem no admin como resgate por batimento de meta.
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
                  Cupom: <strong>{selectedApprovedRequest?.adminCouponCode || selectedApprovedRequest?.couponCode || "-"}</strong>
                </span>
              </div>

              <div style={{ marginTop: 18 }}>
                <div className={styles.listTitle}>Produto da loja</div>
                <p className={styles.sectionSubtitle} style={{ marginTop: 8 }}>
                  O valor usado abaixo e o preco normal atual da loja.
                </p>
                <div className={styles.redemptionProductGrid} style={{ marginTop: 16 }}>
                  {redeemableStoreOptions.map((item) => {
                    const isSelected = item.id === selectedProductSelectionId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.redemptionProductCard} ${isSelected ? styles.redemptionProductCardActive : ""}`}
                        onClick={() => setSelectedProductSelectionId(item.id)}
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.optionLabel}
                            className={styles.redemptionProductImage}
                          />
                        ) : (
                          <div className={styles.redemptionProductPlaceholder}>
                            {item.productName}
                          </div>
                        )}
                        <div className={styles.redemptionProductBody}>
                          <div className={styles.redemptionProductTitle}>{item.productName}</div>
                          <div className={styles.redemptionProductMeta}>
                            {item.color} · {item.size}
                          </div>
                          <div className={styles.redemptionProductFooter}>
                            <strong>{formatMoney(item.unitPrice)}</strong>
                            <span>{item.publishedStock} no site</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className={styles.filterField} style={{ marginTop: 16 }}>
                <span>Quantidade</span>
                <input
                  type="number"
                  min={1}
                  value={redemptionQuantity}
                  onChange={(event) => setRedemptionQuantity(event.target.value)}
                />
              </label>
            </article>

            <article className={styles.catalogCard}>
              <div className={styles.listTitle}>Resumo do resgate</div>
              <div className={styles.redemptionSummaryGrid} style={{ marginTop: 16 }}>
                <div className={styles.redemptionSummaryCard}>
                  <span>Saldo aprovado</span>
                  <strong>{selectedApprovedRequest ? formatMoney(approvedAmount) : "-"}</strong>
                </div>
                <div className={styles.redemptionSummaryCard}>
                  <span>Preco da loja</span>
                  <strong>{selectedProduct ? formatMoney(selectedProduct.unitPrice) : "-"}</strong>
                </div>
                <div className={styles.redemptionSummaryCard}>
                  <span>Total do resgate</span>
                  <strong>{formatMoney(selectedTotal)}</strong>
                </div>
                <div
                  className={`${styles.redemptionSummaryCard} ${
                    exceedsApprovedAmount ? styles.redemptionSummaryCardDanger : styles.redemptionSummaryCardSuccess
                  }`}
                >
                  <span>{exceedsApprovedAmount ? "Ultrapassa" : "Saldo restante"}</span>
                  <strong>{formatMoney(Math.abs(remainingAfterSelection))}</strong>
                </div>
              </div>

              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>Como isso entra no sistema</h3>
                <p>
                  O item vira um resgate entregue no seu historico e aparece no admin com a
                  observacao "Resgate por batimento de meta".
                </p>
              </div>

              {selectedProduct ? (
                <div className={styles.callout} style={{ marginTop: 16 }}>
                  <h3>Item selecionado</h3>
                  <p>
                    {selectedProduct.optionLabel} · SKU {selectedProduct.sku}
                  </p>
                </div>
              ) : null}

              {exceedsApprovedAmount ? (
                <div className={styles.callout} style={{ marginTop: 16 }}>
                  <h3>Total acima do aprovado</h3>
                  <p>
                    Ajuste a quantidade ou escolha um item com valor menor para caber dentro do
                    saldo liberado.
                  </p>
                </div>
              ) : null}

              <div className={styles.filterActions} style={{ marginTop: 16 }}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleRedeemInsidePlatform}
                  disabled={
                    !selectedApprovedRequest ||
                    !selectedProduct ||
                    isSubmittingRedemption ||
                    exceedsApprovedAmount
                  }
                >
                  {isSubmittingRedemption ? "Registrando..." : "Registrar resgate"}
                </button>
              </div>
            </article>
          </div>

          {redemptionFeedback ? (
            <div className={styles.callout} style={{ marginTop: 18 }}>
              <h3>Status do resgate</h3>
              <p>{redemptionFeedback}</p>
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
