"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type {
  PartnerCampaign,
  PartnerCampaignParticipant,
} from "@/lib/parceiros/campaigns-repository";
import type { PartnerCampaignSnapshot } from "@/lib/parceiros/campaigns";
import type {
  CouponPartnerProfile,
  PartnerPersistenceState,
  PartnerRewardRequest,
} from "@/lib/parceiros/repository";

type PartnerCampaignManagerProps = {
  initialProfiles: CouponPartnerProfile[];
  initialCampaigns: PartnerCampaign[];
  initialSnapshots: PartnerCampaignSnapshot[];
  initialPersistence: PartnerPersistenceState;
  initialRewardRequests?: PartnerRewardRequest[];
};

type CampaignApiResponse = {
  ok: boolean;
  message?: string;
  campaign?: PartnerCampaign;
};

type CampaignGoalMode = "unica" | "segmento" | "pessoa";

type RewardRequestApiResponse = {
  ok: boolean;
  message?: string;
  request?: PartnerRewardRequest;
};

type CampaignFormState = {
  editingId: string | null;
  name: string;
  description: string;
  startDate: string;
  endDate: string;
  qualificationGoal: string;
  bonusAmount: string;
  rankingLocked: boolean;
  active: boolean;
  participantIds: string[];
  goalMode: CampaignGoalMode;
  athleteGoal: string;
  influencerGoal: string;
  participantGoals: Record<string, string>;
};

export function PartnerCampaignManager({
  initialProfiles,
  initialCampaigns,
  initialSnapshots,
  initialPersistence,
  initialRewardRequests,
}: PartnerCampaignManagerProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [processingCampaignId, setProcessingCampaignId] = useState("");
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [requestsOpen, setRequestsOpen] = useState(false);
  const [form, setForm] = useState<CampaignFormState>({
    editingId: null,
    name: "",
    description: "",
    startDate: "",
    endDate: "",
    qualificationGoal: "2000",
    bonusAmount: "300",
    rankingLocked: true,
    active: true,
    participantIds: [],
    goalMode: "unica",
    athleteGoal: "1500",
    influencerGoal: "2000",
    participantGoals: {},
  });
  const [rewardRequests, setRewardRequests] = useState<PartnerRewardRequest[]>(
    initialRewardRequests ?? [],
  );
  const [requestDrafts, setRequestDrafts] = useState<
    Record<string, { adminCouponCode: string; adminMessage: string }>
  >({});
  const [processingRequestId, setProcessingRequestId] = useState("");
  const [requestFeedback, setRequestFeedback] = useState("");

  const activeProfiles = useMemo(
    () =>
      initialProfiles
        .filter((profile) => profile.active)
        .sort((left, right) => left.name.localeCompare(right.name)),
    [initialProfiles],
  );
  const snapshotMap = useMemo(
    () => new Map(initialSnapshots.map((item) => [item.campaignId, item])),
    [initialSnapshots],
  );
  const profileById = useMemo(
    () => new Map(activeProfiles.map((profile) => [profile.id, profile])),
    [activeProfiles],
  );

  function getDefaultQualificationGoal(profile: CouponPartnerProfile | undefined, state: CampaignFormState) {
    const fallback = Number(state.qualificationGoal || 0);
    const athleteGoal = Number(state.athleteGoal || 0);
    const influencerGoal = Number(state.influencerGoal || 0);

    if (!profile) {
      return fallback;
    }

    if (profile.role === "atleta") {
      return Number.isFinite(athleteGoal) && athleteGoal > 0 ? athleteGoal : fallback;
    }

    return Number.isFinite(influencerGoal) && influencerGoal > 0 ? influencerGoal : fallback;
  }

  async function saveCampaign(payload: {
    name: string;
    description: string;
    startDate: string;
    endDate: string;
    qualificationGoal: number;
    bonusAmount: number;
    rankingLocked: boolean;
    active: boolean;
    participantIds: string[];
  }) {
    const response = await fetch("/api/influenciadores/campanhas", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = (await response.json()) as CampaignApiResponse;

    if (!response.ok || !result.ok || !result.campaign) {
      throw new Error(result.message || "Nao foi possivel salvar a campanha.");
    }

    return result;
  }

  function getRequestDraft(request: PartnerRewardRequest) {
    return (
      requestDrafts[request.id] ?? {
        adminCouponCode: request.adminCouponCode || "",
        adminMessage: "",
      }
    );
  }

  async function handleReviewRequest(
    request: PartnerRewardRequest,
    action: "approve" | "pay" | "reject",
  ) {
    const draft = getRequestDraft(request);
    const status =
      action === "approve" ? "aprovado" : action === "pay" ? "pago" : "recusado";
    const adminMessage =
      draft.adminMessage.trim() ||
      (action === "approve"
        ? "Cupom liberado. Em ate 72 horas ele ficara disponivel no seu painel."
        : action === "pay"
          ? "Seu apoio foi marcado como pago. Nossa equipe segue com o contato."
          : "Seu pedido foi analisado e nao foi aprovado nessa rodada.");

    if (
      request.requestType === "roupa" &&
      action === "approve" &&
      !draft.adminCouponCode.trim()
    ) {
      setRequestFeedback("Informe o cupom para aprovar a solicitacao de roupa.");
      return;
    }

    setProcessingRequestId(request.id);
    setRequestFeedback("");

    try {
      const response = await fetch(`/api/influenciadores/solicitacoes/${request.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requestType: request.requestType,
          status,
          adminCouponCode: draft.adminCouponCode,
          adminMessage,
        }),
      });
      const result = (await response.json()) as RewardRequestApiResponse;

      if (!response.ok || !result.ok || !result.request) {
        throw new Error(result.message || "Nao foi possivel revisar a solicitacao.");
      }

      setRewardRequests((current) =>
        current.map((item) => (item.id === request.id ? result.request! : item)),
      );
      setRequestFeedback(result.message || "Solicitacao atualizada.");
      router.refresh();
    } catch (error) {
      setRequestFeedback(
        error instanceof Error ? error.message : "Nao foi possivel revisar a solicitacao.",
      );
    } finally {
      setProcessingRequestId("");
    }
  }

  async function handleSaveCampaign() {
    setIsSaving(true);
    setFeedback("");

    try {
      if (form.editingId) {
        const payload = {
          name: form.name,
          description: form.description,
          startDate: form.startDate,
          endDate: form.endDate,
          qualificationGoal: Number(form.qualificationGoal || 0),
          bonusAmount: Number(form.bonusAmount || 0),
          rankingLocked: form.rankingLocked,
          active: form.active,
          participantIds: form.participantIds,
        };
        const response = await fetch(`/api/influenciadores/campanhas/${form.editingId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const result = (await response.json()) as CampaignApiResponse;

        if (!response.ok || !result.ok || !result.campaign) {
          throw new Error(result.message || "Nao foi possivel salvar a campanha.");
        }

        setCampaigns((current) =>
          sortCampaigns(
            current.some((item) => item.id === result.campaign!.id)
              ? current.map((item) =>
                  item.id === result.campaign!.id ? result.campaign! : item,
                )
              : [result.campaign!, ...current],
          ),
        );
        setFeedback(result.message || "Campanha salva com sucesso.");
        resetForm();
        router.refresh();
        return;
      }

      if (form.participantIds.length === 0) {
        throw new Error("Selecione ao menos um participante.");
      }

      const basePayload = {
        description: form.description,
        startDate: form.startDate,
        endDate: form.endDate,
        bonusAmount: Number(form.bonusAmount || 0),
        rankingLocked: form.rankingLocked,
        active: form.active,
      };

      if (form.goalMode === "segmento") {
        const selectedProfiles = form.participantIds
          .map((id) => profileById.get(id))
          .filter((profile): profile is CouponPartnerProfile => Boolean(profile));
        const athleteIds = selectedProfiles
          .filter((profile) => profile.role === "atleta")
          .map((profile) => profile.id);
        const influencerIds = selectedProfiles
          .filter((profile) => profile.role !== "atleta")
          .map((profile) => profile.id);

        const groups: Array<{ label: string; goal: number; participantIds: string[] }> = [];
        if (athleteIds.length > 0) {
          groups.push({
            label: "Atletas",
            goal: Number(form.athleteGoal || 0),
            participantIds: athleteIds,
          });
        }
        if (influencerIds.length > 0) {
          groups.push({
            label: "Influenciadores",
            goal: Number(form.influencerGoal || 0),
            participantIds: influencerIds,
          });
        }

        if (groups.length === 0) {
          throw new Error("Selecione participantes para criar campanha por segmento.");
        }

        const results: CampaignApiResponse[] = [];
        for (const group of groups) {
          const name = groups.length > 1 ? `${form.name} (${group.label})` : form.name;
          results.push(
            await saveCampaign({
              name,
              ...basePayload,
              qualificationGoal: Math.max(group.goal || 0, 0),
              participantIds: group.participantIds,
            }),
          );
        }

        setCampaigns((current) =>
          sortCampaigns([
            ...results.map((result) => result.campaign!).filter(Boolean),
            ...current,
          ]),
        );
        setFeedback(`Criadas ${results.length} campanha(s) por segmento.`);
        resetForm();
        setGoalsOpen(false);
        router.refresh();
        return;
      }

      if (form.goalMode === "pessoa") {
        const groups = new Map<string, { goal: number; participantIds: string[] }>();

        for (const partnerId of form.participantIds) {
          const profile = profileById.get(partnerId);
          const defaultGoal = getDefaultQualificationGoal(profile, form);
          const rawGoal = form.participantGoals[partnerId];
          const parsedGoal = Number.parseFloat(String(rawGoal ?? defaultGoal));
          const goal = Number.isFinite(parsedGoal) ? Math.max(parsedGoal, 0) : 0;
          const key = goal.toFixed(2);
          const current = groups.get(key) ?? { goal, participantIds: [] };
          current.participantIds.push(partnerId);
          current.goal = goal;
          groups.set(key, current);
        }

        const groupedCampaigns = Array.from(groups.values()).filter(
          (group) => group.participantIds.length > 0,
        );

        if (groupedCampaigns.length === 0) {
          throw new Error("Defina ao menos uma meta para criar campanha por pessoa.");
        }

        const sortedGroups = groupedCampaigns.sort((left, right) => right.goal - left.goal);

        const results: CampaignApiResponse[] = [];
        for (const group of sortedGroups) {
          const name =
            sortedGroups.length > 1
              ? `${form.name} (${formatMoney(group.goal)})`
              : form.name;
          results.push(
            await saveCampaign({
              name,
              ...basePayload,
              qualificationGoal: group.goal,
              participantIds: group.participantIds,
            }),
          );
        }

        setCampaigns((current) =>
          sortCampaigns([
            ...results.map((result) => result.campaign!).filter(Boolean),
            ...current,
          ]),
        );
        setFeedback(`Criadas ${results.length} campanha(s) por meta.`);
        resetForm();
        setGoalsOpen(false);
        router.refresh();
        return;
      }

      const result = await saveCampaign({
        name: form.name,
        ...basePayload,
        qualificationGoal: Number(form.qualificationGoal || 0),
        participantIds: form.participantIds,
      });

      setCampaigns((current) => sortCampaigns([result.campaign!, ...current]));
      setFeedback(result.message || "Campanha salva com sucesso.");
      resetForm();
      setGoalsOpen(false);
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar a campanha.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleQuickUpdate(
    campaign: PartnerCampaign,
    patch: Partial<Pick<PartnerCampaign, "rankingLocked" | "active">>,
  ) {
    setProcessingCampaignId(campaign.id);
    setFeedback("");

    try {
      const response = await fetch(`/api/influenciadores/campanhas/${campaign.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: campaign.name,
          description: campaign.description,
          startDate: campaign.startDate,
          endDate: campaign.endDate,
          qualificationGoal: campaign.qualificationGoal,
          bonusAmount: campaign.bonusAmount,
          rankingLocked:
            patch.rankingLocked !== undefined
              ? patch.rankingLocked
              : campaign.rankingLocked,
          active: patch.active !== undefined ? patch.active : campaign.active,
          participantIds: campaign.participants.map((item) => item.partnerId),
        }),
      });
      const result = (await response.json()) as CampaignApiResponse;

      if (!response.ok || !result.ok || !result.campaign) {
        throw new Error(result.message || "Nao foi possivel atualizar a campanha.");
      }

      setCampaigns((current) =>
        sortCampaigns(
          current.map((item) =>
            item.id === result.campaign!.id ? result.campaign! : item,
          ),
        ),
      );
      setFeedback(result.message || "Campanha atualizada com sucesso.");
      router.refresh();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel atualizar a campanha.",
      );
    } finally {
      setProcessingCampaignId("");
    }
  }

  function startEditingCampaign(campaign: PartnerCampaign) {
    setForm({
      editingId: campaign.id,
      name: campaign.name,
      description: campaign.description,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      qualificationGoal: String(campaign.qualificationGoal),
      bonusAmount: String(campaign.bonusAmount),
      rankingLocked: campaign.rankingLocked,
      active: campaign.active,
      participantIds: campaign.participants.map((item) => item.partnerId),
      goalMode: "unica",
      athleteGoal: "1500",
      influencerGoal: "2000",
      participantGoals: {},
    });
    setGoalsOpen(false);
    setFeedback(`Editando a campanha ${campaign.name}.`);
  }

  function resetForm() {
    setForm({
      editingId: null,
      name: "",
      description: "",
      startDate: "",
      endDate: "",
      qualificationGoal: "2000",
      bonusAmount: "300",
      rankingLocked: true,
      active: true,
      participantIds: [],
      goalMode: "unica",
      athleteGoal: "1500",
      influencerGoal: "2000",
      participantGoals: {},
    });
    setGoalsOpen(false);
  }

  function toggleParticipant(partnerId: string) {
    setForm((current) => ({
      ...current,
      ...(() => {
        const selected = current.participantIds.includes(partnerId);
        const participantIds = selected
          ? current.participantIds.filter((item) => item !== partnerId)
          : [...current.participantIds, partnerId];

        if (current.goalMode !== "pessoa") {
          return { participantIds };
        }

        const participantGoals = { ...current.participantGoals };

        if (selected) {
          delete participantGoals[partnerId];
        } else if (!participantGoals[partnerId]) {
          const profile = profileById.get(partnerId);
          participantGoals[partnerId] = String(getDefaultQualificationGoal(profile, current));
        }

        return { participantIds, participantGoals };
      })(),
    }));
  }

  const metrics = useMemo(() => {
    const activeCampaigns = campaigns.filter((campaign) => campaign.active).length;
    const lockedCampaigns = campaigns.filter((campaign) => campaign.rankingLocked).length;
    const totalParticipants = campaigns.reduce(
      (sum, campaign) => sum + campaign.participants.length,
      0,
    );

    return [
      {
        label: "Campanhas salvas",
        value: String(campaigns.length),
        detail: "Corridas criadas dentro do sistema.",
      },
      {
        label: "Campanhas ativas",
        value: String(activeCampaigns),
        detail: "Sao as campanhas que aparecem no painel do parceiro.",
      },
      {
        label: "Ranking travado",
        value: String(lockedCampaigns),
        detail: "Quando travado, o 1º lugar aparece como 2º no painel deles.",
      },
      {
        label: "Participacoes",
        value: String(totalParticipants),
        detail: "Soma das pessoas selecionadas em todas as campanhas.",
      },
    ];
  }, [campaigns]);

  const pendingRequests = useMemo(
    () => rewardRequests.filter((request) => request.status === "pendente"),
    [rewardRequests],
  );

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>Campanhas dos parceiros</div>
          <p className={styles.sectionSubtitle}>
            Crie corridas separadas da meta normal de 3 meses, escolha os
            participantes e controle se o ranking deles vai ficar travado ou liberado.
          </p>
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chip}>Bonus extra separado do contrato</span>
          <span className={styles.chip}>Ranking parcial pode ficar mascarado</span>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => setRequestsOpen((current) => !current)}
            style={{ padding: "6px 10px" }}
          >
            {requestsOpen
              ? "Fechar solicitacoes"
              : `Solicitacoes (${pendingRequests.length})`}
          </button>
        </div>
      </div>

      <div className={styles.metricGridCompact}>
        {metrics.map((metric) => (
          <article key={metric.label} className={styles.metricCard}>
            <div className={styles.metricLabel}>{metric.label}</div>
            <div className={styles.metricValue}>{metric.value}</div>
            <div className={styles.metricHint}>{metric.detail}</div>
          </article>
        ))}
      </div>

      {feedback ? (
        <div className={styles.callout} style={{ marginTop: 20 }}>
          <h3>Status das campanhas</h3>
          <p>{feedback}</p>
        </div>
      ) : null}

      {requestsOpen ? (
        <article className={styles.catalogCard} style={{ marginTop: 20 }}>
          <div className={styles.sectionTitle}>Solicitacoes de resgate (meta de 3 meses)</div>
          <p className={styles.sectionSubtitle}>
            Quando o parceiro pede resgate no painel dele, aparece aqui para voce aprovar e
            informar o cupom.
          </p>

          {requestFeedback ? (
            <div className={styles.callout} style={{ marginTop: 16 }}>
              <h3>Status das solicitacoes</h3>
              <p>{requestFeedback}</p>
            </div>
          ) : null}

          {pendingRequests.length > 0 ? (
            <div className={styles.tableWrap} style={{ marginTop: 16 }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Parceiro</th>
                    <th>Cupom</th>
                    <th>Tipo</th>
                    <th>Destino</th>
                    <th>Valor</th>
                    <th>Cupom liberado</th>
                    <th>Mensagem</th>
                    <th>Acoes</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRequests.map((request) => (
                    <tr key={request.id}>
                      <td>{request.partnerName}</td>
                      <td>{request.couponCode}</td>
                      <td>{request.requestType === "apoio" ? "Apoio" : "Roupa"}</td>
                      <td>{request.supportGoal || "Cupom / roupa"}</td>
                      <td>{formatMoney(request.requestedAmount)}</td>
                      <td>
                        {request.requestType === "roupa" ? (
                          <input
                            value={getRequestDraft(request).adminCouponCode}
                            onChange={(event) =>
                              setRequestDrafts((current) => ({
                                ...current,
                                [request.id]: {
                                  ...getRequestDraft(request),
                                  adminCouponCode: event.target.value,
                                },
                              }))
                            }
                            placeholder="Ex.: ALIMA72H"
                          />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <input
                          value={getRequestDraft(request).adminMessage}
                          onChange={(event) =>
                            setRequestDrafts((current) => ({
                              ...current,
                              [request.id]: {
                                ...getRequestDraft(request),
                                adminMessage: event.target.value,
                              },
                            }))
                          }
                          placeholder="Mensagem (opcional)"
                        />
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => handleReviewRequest(request, "approve")}
                            disabled={processingRequestId === request.id}
                          >
                            Aprovar
                          </button>
                          {request.requestType === "apoio" ? (
                            <button
                              type="button"
                              className={styles.secondaryButton}
                              onClick={() => handleReviewRequest(request, "pay")}
                              disabled={processingRequestId === request.id}
                            >
                              Marcar pago
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => handleReviewRequest(request, "reject")}
                            disabled={processingRequestId === request.id}
                          >
                            Recusar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className={styles.emptyState} style={{ marginTop: 16 }}>
              Nenhuma solicitacao pendente agora.
            </div>
          )}
        </article>
      ) : null}

      <div className={styles.orderLayout} style={{ marginTop: 24 }}>
        <div className={styles.stack}>
          <article className={styles.catalogCard}>
            <div className={styles.sectionTitle}>
              {form.editingId ? "Editar campanha" : "Nova campanha"}
            </div>
            <p className={styles.sectionSubtitle}>
              Defina o periodo, a meta de entrada, o bonus e quem vai entrar nessa corrida.
            </p>

            <div className={styles.filterGrid} style={{ marginTop: 20 }}>
              <label className={styles.filterField}>
                <span>Nome da campanha</span>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="Ex.: Corrida ate 03/07"
                />
              </label>
              <label className={styles.filterField}>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span>Meta para entrar</span>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => setGoalsOpen((current) => !current)}
                    disabled={Boolean(form.editingId)}
                    style={{ padding: "6px 10px" }}
                  >
                    {goalsOpen ? "Fechar opcoes" : "Personalizar"}
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.qualificationGoal}
                  disabled={goalsOpen && !form.editingId && form.goalMode !== "unica"}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      qualificationGoal: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Inicio</span>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, startDate: event.target.value }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Fim</span>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, endDate: event.target.value }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Bonus em Pix</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.bonusAmount}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, bonusAmount: event.target.value }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>Descricao para eles</span>
                <input
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  placeholder="Ex.: bateu 2 mil, entrou na corrida"
                />
              </label>
            </div>

            {goalsOpen && !form.editingId ? (
              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>Metas personalizadas</h3>
                <p style={{ marginTop: 6 }}>
                  Segmento e pessoa criam campanhas separadas para cada meta.
                </p>

                <div className={styles.checkboxGrid} style={{ marginTop: 12 }}>
                  <label className={styles.checkboxCard}>
                    <input
                      type="radio"
                      name="goalMode"
                      checked={form.goalMode === "unica"}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          goalMode: "unica",
                        }))
                      }
                    />
                    <div>
                      <strong>Meta unica</strong>
                      <span>Uma campanha para todos com a mesma meta.</span>
                    </div>
                  </label>
                  <label className={styles.checkboxCard}>
                    <input
                      type="radio"
                      name="goalMode"
                      checked={form.goalMode === "segmento"}
                      onChange={() =>
                        setForm((current) => ({
                          ...current,
                          goalMode: "segmento",
                        }))
                      }
                    />
                    <div>
                      <strong>Por segmento</strong>
                      <span>Cria uma campanha para atletas e outra para influenciadores.</span>
                    </div>
                  </label>
                  <label className={styles.checkboxCard}>
                    <input
                      type="radio"
                      name="goalMode"
                      checked={form.goalMode === "pessoa"}
                      onChange={() =>
                        setForm((current) => {
                          const participantGoals = { ...current.participantGoals };
                          for (const participantId of current.participantIds) {
                            if (!participantGoals[participantId]) {
                              const profile = profileById.get(participantId);
                              participantGoals[participantId] = String(
                                getDefaultQualificationGoal(profile, current),
                              );
                            }
                          }

                          return {
                            ...current,
                            goalMode: "pessoa",
                            participantGoals,
                          };
                        })
                      }
                    />
                    <div>
                      <strong>Por pessoa</strong>
                      <span>Cria campanhas separadas agrupando as metas definidas.</span>
                    </div>
                  </label>
                </div>

                {form.goalMode === "segmento" ? (
                  <div className={styles.filterGrid} style={{ marginTop: 12 }}>
                    <label className={styles.filterField}>
                      <span>Meta do atleta</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.athleteGoal}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            athleteGoal: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className={styles.filterField}>
                      <span>Meta do influenciador</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.influencerGoal}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            influencerGoal: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {form.goalMode === "pessoa" ? (
                  <div style={{ marginTop: 12 }}>
                    {form.participantIds.length > 0 ? (
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Parceiro</th>
                              <th>Segmento</th>
                              <th>Meta</th>
                            </tr>
                          </thead>
                          <tbody>
                            {form.participantIds
                              .map((id) => profileById.get(id))
                              .filter(
                                (profile): profile is CouponPartnerProfile => Boolean(profile),
                              )
                              .sort((left, right) => left.name.localeCompare(right.name))
                              .map((profile) => (
                                <tr key={profile.id}>
                                  <td>{profile.name}</td>
                                  <td>
                                    {profile.role === "atleta" ? "Atleta" : "Influenciador"}
                                  </td>
                                  <td style={{ maxWidth: 180 }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={
                                        form.participantGoals[profile.id] ??
                                        String(getDefaultQualificationGoal(profile, form))
                                      }
                                      onChange={(event) =>
                                        setForm((current) => ({
                                          ...current,
                                          participantGoals: {
                                            ...current.participantGoals,
                                            [profile.id]: event.target.value,
                                          },
                                        }))
                                      }
                                    />
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        Selecione os participantes abaixo para definir a meta de cada um.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className={styles.checkboxGrid}>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={form.rankingLocked}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      rankingLocked: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Travar ranking do parceiro</strong>
                  <span>
                    Enquanto travado, quem estiver em 1º aparece como 2º no painel deles.
                  </span>
                </div>
              </label>
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      active: event.target.checked,
                    }))
                  }
                />
                <div>
                  <strong>Campanha ativa</strong>
                  <span>
                    Quando ativa, ela aparece para os participantes no painel deles.
                  </span>
                </div>
              </label>
            </div>

            <div style={{ marginTop: 20 }}>
              <div className={styles.sectionTitle} style={{ fontSize: "1.05rem" }}>
                Quem participa
              </div>
              <p className={styles.sectionSubtitle}>
                Selecione so quem entra nessa campanha, sem mexer no contrato normal.
              </p>
              <div className={styles.checkboxList}>
                {activeProfiles.map((profile) => (
                  <label key={profile.id} className={styles.checkboxCard}>
                    <input
                      type="checkbox"
                      checked={form.participantIds.includes(profile.id)}
                      onChange={() => toggleParticipant(profile.id)}
                    />
                    <div>
                      <strong>{profile.name}</strong>
                      <span>
                        {profile.couponCode} ·{" "}
                        {profile.role === "atleta" ? "Atleta" : "Influenciador"}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.filterActions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveCampaign}
                disabled={isSaving}
              >
                {isSaving
                  ? "Salvando..."
                  : form.editingId
                    ? "Atualizar campanha"
                    : "Criar campanha"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetForm}
              >
                Limpar
              </button>
            </div>
          </article>
        </div>

        <div className={styles.stack}>
          {campaigns.length > 0 ? (
            campaigns.map((campaign) => {
              const snapshot = snapshotMap.get(campaign.id);

              return (
                <article key={campaign.id} className={styles.catalogCard}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.sectionTitle}>{campaign.name}</div>
                    <span
                      className={`${styles.pill} ${
                        campaign.active ? styles.pillMedium : styles.pillLow
                      }`}
                    >
                      {campaign.active ? "Ativa" : "Encerrada"}
                    </span>
                  </div>

                  <p className={styles.sectionSubtitle}>
                    {campaign.description || "Sem descricao adicional."}
                  </p>

                  <div className={styles.metaList} style={{ marginTop: 16 }}>
                    <div className={styles.metaItem}>
                      <strong>Periodo</strong>
                      <span>
                        {formatDate(campaign.startDate)} ate {formatDate(campaign.endDate)}
                      </span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Meta para entrar</strong>
                      <span>{formatMoney(campaign.qualificationGoal)}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Bonus</strong>
                      <span>{formatMoney(campaign.bonusAmount)} no Pix</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Participantes</strong>
                      <span>{campaign.participants.length}</span>
                    </div>
                    <div className={styles.metaItem}>
                      <strong>Ranking</strong>
                      <span>
                        {campaign.rankingLocked ? "Travado para eles" : "Liberado para eles"}
                      </span>
                    </div>
                  </div>

                  <div className={styles.filterActions} style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => startEditingCampaign(campaign)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() =>
                        handleQuickUpdate(campaign, {
                          rankingLocked: !campaign.rankingLocked,
                        })
                      }
                      disabled={processingCampaignId === campaign.id}
                    >
                      {campaign.rankingLocked ? "Liberar ranking" : "Travar ranking"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() =>
                        handleQuickUpdate(campaign, {
                          active: !campaign.active,
                        })
                      }
                      disabled={processingCampaignId === campaign.id}
                    >
                      {campaign.active ? "Encerrar" : "Reativar"}
                    </button>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <div className={styles.sectionTitle} style={{ fontSize: "1rem" }}>
                      Ranking atual
                    </div>
                    {snapshot && snapshot.leaderboard.length > 0 ? (
                      <div className={styles.tableWrap} style={{ marginTop: 12 }}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Parceiro</th>
                              <th>Papel</th>
                              <th>Liquido</th>
                              <th>Pedidos</th>
                              <th>Entrou</th>
                            </tr>
                          </thead>
                          <tbody>
                            {snapshot.leaderboard.map((entry) => (
                              <tr key={`${campaign.id}-${entry.partnerId}`}>
                                <td>{entry.actualRank}º</td>
                                <td>{entry.name}</td>
                                <td>
                                  {entry.role === "atleta" ? "Atleta" : "Influenciador"}
                                </td>
                                <td>{formatMoney(entry.netRevenue)}</td>
                                <td>{entry.orders}</td>
                                <td>
                                  {entry.qualified
                                    ? "Meta batida"
                                    : `Faltam ${formatMoney(entry.remainingToGoal)}`}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        Ainda nao houve leitura de ranking para essa campanha.
                      </div>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              Ainda nao existe nenhuma campanha salva.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function sortCampaigns(campaigns: PartnerCampaign[]) {
  return campaigns.slice().sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    return right.startDate.localeCompare(left.startDate);
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDate(value: string) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR").format(new Date(`${value}T00:00:00`));
}
