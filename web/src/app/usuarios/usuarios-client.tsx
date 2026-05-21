"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import type {
  CouponDiscoveryRow,
  CouponPartnerProfile,
  PartnerPersistenceState,
  PartnerRole,
} from "@/lib/parceiros/repository";

type UsuariosClientProps = {
  initialProfiles: CouponPartnerProfile[];
  initialKnownCoupons: CouponDiscoveryRow[];
  initialPersistence: PartnerPersistenceState;
  initialDiscoveryState: PartnerPersistenceState;
  initialDraft: {
    name: string;
    couponCode: string;
    role: PartnerRole;
    active: boolean;
    notes: string;
  };
};

type PartnerApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: PartnerPersistenceState;
  profile?: CouponPartnerProfile;
};

type PartnerFormState = {
  id: string | null;
  name: string;
  couponCode: string;
  role: PartnerRole;
  active: boolean;
  notes: string;
};

type CouponListRow = {
  code: string;
  orders: number;
  revenue: number;
  lastOrderAt: string | null;
  status: "Ja classificado" | "Pendente";
};

export function UsuariosClient({
  initialProfiles,
  initialKnownCoupons,
  initialPersistence,
  initialDiscoveryState,
  initialDraft,
}: UsuariosClientProps) {
  const [profiles, setProfiles] = useState(sortProfiles(initialProfiles));
  const [persistence, setPersistence] =
    useState<PartnerPersistenceState>(initialPersistence);
  const [feedback, setFeedback] = useState(initialPersistence.message);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<PartnerFormState>({
    id: null,
    ...initialDraft,
  });

  const metrics = useMemo(() => {
    const activeProfiles = profiles.filter((profile) => profile.active);
    const influencers = activeProfiles.filter(
      (profile) => profile.role === "influenciador",
    ).length;
    const athletes = activeProfiles.filter(
      (profile) => profile.role === "atleta",
    ).length;

    return [
      {
        label: "Perfis cadastrados",
        value: String(profiles.length),
        detail: "Cupons ja classificados dentro do sistema",
      },
      {
        label: "Influenciadores ativos",
        value: String(influencers),
        detail: "Cupons no programa de roupa por janela de 3 meses",
      },
      {
        label: "Atletas ativos",
        value: String(athletes),
        detail: "Cupons com janela de 3 meses e apoio acumulativo",
      },
      {
        label: "Cupons vistos na loja",
        value: String(initialKnownCoupons.length),
        detail: "Cupons encontrados nos pedidos reais da Nuvemshop",
      },
    ];
  }, [initialKnownCoupons.length, profiles]);

  const mappedCouponCodes = useMemo(
    () => new Set(profiles.map((profile) => profile.couponCode)),
    [profiles],
  );
  const unmappedCoupons = useMemo(
    () =>
      initialKnownCoupons.filter((coupon) => !mappedCouponCodes.has(coupon.code)),
    [initialKnownCoupons, mappedCouponCodes],
  );
  const couponRows = useMemo(() => {
    const rows = new Map<string, CouponListRow>();

    initialKnownCoupons.forEach((coupon) => {
      rows.set(coupon.code, {
        code: coupon.code,
        orders: coupon.orders,
        revenue: coupon.revenue,
        lastOrderAt: coupon.lastOrderAt,
        status: mappedCouponCodes.has(coupon.code) ? "Ja classificado" : "Pendente",
      });
    });

    profiles.forEach((profile) => {
      const current = rows.get(profile.couponCode);

      rows.set(profile.couponCode, {
        code: profile.couponCode,
        orders: current?.orders ?? 0,
        revenue: current?.revenue ?? 0,
        lastOrderAt: current?.lastOrderAt ?? null,
        status: "Ja classificado",
      });
    });

    return Array.from(rows.values()).sort((left, right) => {
      const leftDate = left.lastOrderAt ? new Date(left.lastOrderAt).getTime() : 0;
      const rightDate = right.lastOrderAt ? new Date(right.lastOrderAt).getTime() : 0;

      if (rightDate !== leftDate) {
        return rightDate - leftDate;
      }

      if (right.orders !== left.orders) {
        return right.orders - left.orders;
      }

      return left.code.localeCompare(right.code);
    });
  }, [initialKnownCoupons, mappedCouponCodes, profiles]);

  async function handleSaveProfile() {
    setIsSaving(true);
    setFeedback("");

    try {
      const payload = {
        name: form.name,
        couponCode: form.couponCode.trim().toUpperCase(),
        role: form.role,
        active: form.active,
        notes: form.notes,
      };
      const response = await fetch(
        form.id
          ? `/api/usuarios/parceiros/${form.id}`
          : "/api/usuarios/parceiros",
        {
          method: form.id ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json()) as PartnerApiResponse;

      if (!response.ok || !result.ok || !result.profile) {
        throw new Error(result.message || "Nao foi possivel salvar o parceiro.");
      }

      setProfiles((current) =>
        sortProfiles(
          current.some((profile) => profile.id === result.profile!.id)
            ? current.map((profile) =>
                profile.id === result.profile!.id ? result.profile! : profile,
              )
            : [result.profile!, ...current],
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setFeedback(
        result.message ||
          (form.id
            ? "Parceiro atualizado com sucesso."
            : "Parceiro salvo com sucesso."),
      );
      resetForm();
    } catch (error) {
      setFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o parceiro.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setForm({
      id: null,
      ...initialDraft,
    });
  }

  function startEditingProfile(profile: CouponPartnerProfile) {
    setForm({
      id: profile.id,
      name: profile.name,
      couponCode: profile.couponCode,
      role: profile.role,
      active: profile.active,
      notes: profile.notes,
    });
    setFeedback(`Editando o cupom ${profile.couponCode}.`);
  }

  function applyKnownCoupon(code: string, role: PartnerRole = "influenciador") {
    setForm((current) => ({
      ...current,
      id: null,
      name: current.name || code,
      couponCode: code,
      role,
      active: true,
    }));
    setFeedback(`Cupom ${code} pronto para classificacao.`);
  }

  const statusTone =
    !persistence.enabled || feedback.toLowerCase().includes("nao foi")
      ? styles.warningPanel
      : styles.callout;

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Classificacao por cupom</div>
            <p className={styles.sectionSubtitle}>
              Aqui voce define quais cupons entram no programa de influenciador e
              quais entram como atleta.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>Base: pedidos reais da Nuvemshop</span>
            <span className={styles.chip}>Cadastro manual permitido</span>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {metrics.map((metric) => (
            <article key={metric.label} className={styles.metricCard}>
              <div className={styles.metricLabel}>{metric.label}</div>
              <div className={styles.metricValue}>{metric.value}</div>
              <div className={styles.metricHint}>{metric.detail}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.twoColumn}>
          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>
                  {form.id ? "Editar parceiro" : "Novo parceiro"}
                </div>
                <p className={styles.sectionSubtitle}>
                  Salve o cupom e marque se ele entra como influenciador ou
                  atleta.
                </p>
              </div>
            </div>

            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Nome interno</span>
                <input
                  type="text"
                  placeholder="Ex.: Larissa RM"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <div className={styles.filterGrid}>
                <label className={styles.filterField}>
                  <span>Cupom</span>
                  <input
                    type="text"
                    placeholder="Ex.: LARIRM"
                    value={form.couponCode}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        couponCode: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>

                <label className={styles.filterField}>
                  <span>Perfil</span>
                  <select
                    value={form.role}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        role: event.target.value === "atleta" ? "atleta" : "influenciador",
                      }))
                    }
                  >
                    <option value="influenciador">Influenciador</option>
                    <option value="atleta">Atleta</option>
                  </select>
                </label>
              </div>

              <label className={styles.filterField}>
                <span>Observacao interna</span>
                <input
                  type="text"
                  placeholder="Ex.: cupom oficial do atleta para campeonatos"
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              <label
                className={styles.secondaryButton}
                style={{ gap: 10, cursor: "pointer", width: "fit-content" }}
              >
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
                Cupom ativo no programa
              </label>
            </div>

            <div className={styles.filterActions} style={{ marginTop: 16 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveProfile}
                disabled={!persistence.enabled || isSaving}
              >
                {isSaving
                  ? "Salvando..."
                  : form.id
                    ? "Salvar edicao"
                    : "Salvar parceiro"}
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={resetForm}
              >
                Limpar formulario
              </button>
            </div>
          </article>

          <article className={statusTone}>
            <h3>Programa atual</h3>
            <p>{feedback || persistence.message}</p>
            <p style={{ marginTop: 10 }}>
              Influenciador: libera 14% em roupa quando bater R$ 2.000 em ate 3
              meses.
            </p>
            <p style={{ marginTop: 10 }}>
              Atleta: libera 10% em roupa quando bater R$ 1.500 em ate 3 meses e
              acumula 4% de toda venda para apoio esportivo.
            </p>
            <p style={{ marginTop: 10 }}>{initialDiscoveryState.message}</p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Cupons encontrados na loja</div>
            <p className={styles.sectionSubtitle}>
              Aqui entram os cupons vistos nos pedidos e tambem os cupons ja
              cadastrados no sistema, mesmo quando ainda nao venderam.
            </p>
          </div>
          <div className={styles.chipRow}>
            <span className={styles.chip}>
              {unmappedCoupons.length} sem classificacao
            </span>
            <span className={styles.chip}>{couponRows.length} cupom(ns) na lista</span>
          </div>
        </div>

        {couponRows.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhum cupom encontrado nos pedidos e nenhum cupom cadastrado ainda.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Cupom</th>
                  <th>Pedidos</th>
                  <th>Faturamento</th>
                  <th>Ultimo pedido</th>
                  <th>Status</th>
                  <th>Atalho</th>
                </tr>
              </thead>
              <tbody>
                {couponRows.map((coupon) => (
                  <tr key={coupon.code}>
                    <td>{coupon.code}</td>
                    <td>{coupon.orders}</td>
                    <td>{formatMoney(coupon.revenue)}</td>
                    <td>{formatDateTime(coupon.lastOrderAt)}</td>
                    <td>{coupon.status}</td>
                    <td>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => applyKnownCoupon(coupon.code, "influenciador")}
                        >
                          Virar influenciador
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          onClick={() => applyKnownCoupon(coupon.code, "atleta")}
                        >
                          Virar atleta
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Parceiros salvos</div>
            <p className={styles.sectionSubtitle}>
              Tudo que estiver ativo aqui entra na leitura operacional da aba de
              influenciadores.
            </p>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className={styles.emptyState}>
            Nenhum parceiro salvo ainda. Use o formulario acima para cadastrar o
            primeiro cupom.
          </div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cupom</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Observacao</th>
                  <th>Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.name}</td>
                    <td>{profile.couponCode}</td>
                    <td>
                      {profile.role === "atleta" ? "Atleta" : "Influenciador"}
                    </td>
                    <td>{profile.active ? "Ativo" : "Pausado"}</td>
                    <td>{profile.notes || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => startEditingProfile(profile)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function sortProfiles(profiles: CouponPartnerProfile[]) {
  return [...profiles].sort((left, right) => {
    if (left.active !== right.active) {
      return left.active ? -1 : 1;
    }

    if (left.role !== right.role) {
      return left.role.localeCompare(right.role);
    }

    return left.name.localeCompare(right.name);
  });
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}
