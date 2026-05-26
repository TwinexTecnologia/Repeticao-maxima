"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import styles from "@/components/panel.module.css";
import type { PartnerCampaign } from "@/lib/parceiros/campaigns-repository";
import type { PartnerCampaignSnapshot } from "@/lib/parceiros/campaigns";
import type {
  CouponPartnerProfile,
  PartnerPersistenceState,
} from "@/lib/parceiros/repository";

type PartnerCampaignManagerProps = {
  initialProfiles: CouponPartnerProfile[];
  initialCampaigns: PartnerCampaign[];
  initialSnapshots: PartnerCampaignSnapshot[];
  initialPersistence: PartnerPersistenceState;
};

type CampaignApiResponse = {
  ok: boolean;
  message?: string;
  campaign?: PartnerCampaign;
};

type CampaignFormState = {
  editingId: string | null;
  name: string;
  description: string;
  importantMessage: string;
  useCurrentWindow: boolean;
  startDate: string;
  endDate: string;
  qualificationGoal: string;
  bonusAmount: string;
  rankingLocked: boolean;
  active: boolean;
  participantIds: string[];
};

export function PartnerCampaignManager({
  initialProfiles,
  initialCampaigns,
  initialSnapshots,
  initialPersistence,
}: PartnerCampaignManagerProps) {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [processingCampaignId, setProcessingCampaignId] = useState("");
  const [form, setForm] = useState<CampaignFormState>({
    editingId: null,
    name: "",
    description: "",
    importantMessage: "",
    useCurrentWindow: false,
    startDate: "",
    endDate: "",
    qualificationGoal: "2000",
    bonusAmount: "300",
    rankingLocked: true,
    active: true,
    participantIds: [],
  });

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

  async function handleSaveCampaign() {
    setIsSaving(true);
    setFeedback("");

    try {
      const name = form.name.trim();
      const effectiveWindow = form.useCurrentWindow ? getCurrentWindowRange() : null;
      const startDate = (effectiveWindow?.startDate ?? form.startDate).trim();
      const endDate = (effectiveWindow?.endDate ?? form.endDate).trim();
      const qualificationGoal = Number(form.qualificationGoal || 0);
      const bonusAmount = Number(form.bonusAmount || 0);

      if (!name) {
        throw new Error("Informe o nome da campanha.");
      }

      if (!startDate || !endDate) {
        throw new Error("Informe o inicio e o fim da campanha.");
      }

      if (form.participantIds.length === 0) {
        throw new Error("Selecione ao menos um participante.");
      }

      if (!Number.isFinite(qualificationGoal) || qualificationGoal <= 0) {
        throw new Error("A meta para entrar precisa ser maior que zero.");
      }

      if (!Number.isFinite(bonusAmount) || bonusAmount < 0) {
        throw new Error("O bonus precisa ser um valor valido.");
      }

      const payload = {
        name,
        description: form.description,
        importantMessage: form.importantMessage,
        useCurrentWindow: form.useCurrentWindow,
        startDate,
        endDate,
        qualificationGoal,
        bonusAmount,
        rankingLocked: form.rankingLocked,
        active: form.active,
        participantIds: form.participantIds,
      };

      const response = await fetch(
        form.editingId
          ? `/api/influenciadores/campanhas/${form.editingId}`
          : "/api/influenciadores/campanhas",
        {
          method: form.editingId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
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
          importantMessage: campaign.importantMessage,
          useCurrentWindow: campaign.useCurrentWindow,
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
      importantMessage: campaign.importantMessage,
      useCurrentWindow: campaign.useCurrentWindow,
      startDate: campaign.startDate,
      endDate: campaign.endDate,
      qualificationGoal: String(campaign.qualificationGoal),
      bonusAmount: String(campaign.bonusAmount),
      rankingLocked: campaign.rankingLocked,
      active: campaign.active,
      participantIds: campaign.participants.map((item) => item.partnerId),
    });
    setFeedback(`Editando a campanha ${campaign.name}.`);
  }

  function resetForm() {
    setForm({
      editingId: null,
      name: "",
      description: "",
      importantMessage: "",
      useCurrentWindow: false,
      startDate: "",
      endDate: "",
      qualificationGoal: "2000",
      bonusAmount: "300",
      rankingLocked: true,
      active: true,
      participantIds: [],
    });
  }

  function toggleParticipant(partnerId: string) {
    setForm((current) => ({
      ...current,
      participantIds: current.participantIds.includes(partnerId)
        ? current.participantIds.filter((item) => item !== partnerId)
        : [...current.participantIds, partnerId],
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

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <div>
          <div className={styles.sectionTitle}>Campanhas dos parceiros</div>
          <p className={styles.sectionSubtitle}>
            Crie corridas separadas da meta normal de 3 meses, escolha os participantes e
            controle se o ranking deles vai ficar travado ou liberado.
          </p>
        </div>
        <div className={styles.chipRow}>
          <span className={styles.chip}>Bonus extra separado do contrato</span>
          <span className={styles.chip}>Ranking parcial pode ficar mascarado</span>
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
                <span>Meta para entrar</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.qualificationGoal}
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
                  disabled={form.useCurrentWindow}
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
                  disabled={form.useCurrentWindow}
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
              <label className={styles.filterField}>
                <span>Importante (opcional)</span>
                <input
                  value={form.importantMessage}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      importantMessage: event.target.value,
                    }))
                  }
                  placeholder="Ex.: cupom vai aparecer em ate 72h no painel"
                />
              </label>
            </div>

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
              <label className={styles.checkboxCard}>
                <input
                  type="checkbox"
                  checked={form.useCurrentWindow}
                  onChange={(event) =>
                    setForm((current) => {
                      const next = event.target.checked;
                      const windowRange = next ? getCurrentWindowRange() : null;
                      return {
                        ...current,
                        useCurrentWindow: next,
                        startDate: windowRange?.startDate ?? current.startDate,
                        endDate: windowRange?.endDate ?? current.endDate,
                      };
                    })
                  }
                />
                <div>
                  <strong>Usar janela atual</strong>
                  <span>Mostra a janela de 3 meses atual para eles no lugar do periodo.</span>
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
              const displayedStartDate = snapshot?.startDate ?? campaign.startDate;
              const displayedEndDate = snapshot?.endDate ?? campaign.endDate;

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
                      <strong>{campaign.useCurrentWindow ? "Janela atual" : "Periodo"}</strong>
                      <span>
                        {formatDate(displayedStartDate)} ate {formatDate(displayedEndDate)}
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
                                <td>{entry.role === "atleta" ? "Atleta" : "Influenciador"}</td>
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
            <div className={styles.emptyState}>Ainda nao existe nenhuma campanha salva.</div>
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

function getCurrentWindowRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startDate = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-01`;
  const endDate = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;

  return {
    startDate,
    endDate,
  };
}
