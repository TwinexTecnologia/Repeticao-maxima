"use client";

import { useMemo, useState } from "react";

import styles from "@/components/panel.module.css";
import type { PartnerRewardRequest } from "@/lib/parceiros/repository";
import type {
  EmployeeAccessUser,
  PartnerAccessUser,
  PartnerUserType,
  UserAccessPersistenceState,
  UserMenuPermissionKey,
  UserMenuPermissions,
  UserPartnerOption,
  UserStoreCustomerOption,
} from "@/lib/usuarios/repository";

type UsuariosClientProps = {
  initialEmployees: EmployeeAccessUser[];
  initialPartners: PartnerAccessUser[];
  initialPartnerOptions: UserPartnerOption[];
  initialStoreCustomerOptions: UserStoreCustomerOption[];
  initialPersistence: UserAccessPersistenceState;
  initialPendingRequests: PartnerRewardRequest[];
};

type EmployeeApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: UserAccessPersistenceState;
  employee?: EmployeeAccessUser;
};

type PartnerApiResponse = {
  ok: boolean;
  message?: string;
  persistence?: UserAccessPersistenceState;
  partner?: PartnerAccessUser;
  generatedPassword?: string | null;
};

type RequestReviewApiResponse = {
  ok: boolean;
  message?: string;
  request?: PartnerRewardRequest;
};

type EmployeeFormState = {
  fullName: string;
  email: string;
  password: string;
  active: boolean;
  notes: string;
  permissions: UserMenuPermissions;
};

const MENU_OPTIONS: Array<{
  key: UserMenuPermissionKey;
  label: string;
}> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "compras", label: "Compras" },
  { key: "estoque", label: "Estoque" },
  { key: "pedidos", label: "Pedidos" },
  { key: "financeiro", label: "Financeiro" },
  { key: "nuvemshop", label: "Nuvemshop" },
  { key: "influenciadores", label: "Influenciadores" },
  { key: "empresa", label: "Empresa" },
  { key: "usuarios", label: "Usuarios" },
];

const DEFAULT_PERMISSIONS: UserMenuPermissions = {
  dashboard: true,
  compras: false,
  estoque: false,
  pedidos: false,
  financeiro: false,
  nuvemshop: false,
  influenciadores: false,
  empresa: false,
  usuarios: false,
};

function getDefaultEmployeeForm(): EmployeeFormState {
  return {
    fullName: "",
    email: "",
    password: "",
    active: true,
    notes: "",
    permissions: { ...DEFAULT_PERMISSIONS },
  };
}

export function UsuariosClient({
  initialEmployees,
  initialPartners,
  initialPartnerOptions,
  initialStoreCustomerOptions,
  initialPersistence,
  initialPendingRequests,
}: UsuariosClientProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [partners, setPartners] = useState(initialPartners);
  const [pendingRequests, setPendingRequests] = useState(initialPendingRequests);
  const [persistence, setPersistence] =
    useState<UserAccessPersistenceState>(initialPersistence);
  const [employeeFeedback, setEmployeeFeedback] = useState("");
  const [partnerFeedback, setPartnerFeedback] = useState("");
  const [requestFeedback, setRequestFeedback] = useState("");
  const [partnerGeneratedPassword, setPartnerGeneratedPassword] = useState("");
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isSavingPartner, setIsSavingPartner] = useState(false);
  const [savingRequestId, setSavingRequestId] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState<EmployeeFormState>(getDefaultEmployeeForm);
  const [requestDrafts, setRequestDrafts] = useState<
    Record<string, { adminCouponCode: string; adminMessage: string }>
  >(() =>
    Object.fromEntries(
      initialPendingRequests.map((request) => [
        request.id,
        {
          adminCouponCode: request.adminCouponCode || request.couponCode || "",
          adminMessage: request.adminMessage || "",
        },
      ]),
    ),
  );
  const [partnerForm, setPartnerForm] = useState({
    linkedPartnerId: "",
    nuvemshopCustomerLookup: "",
    nuvemshopCustomerId: "",
    nuvemshopCustomerName: "",
    nuvemshopCustomerEmail: "",
    partnerType: "influenciador" as PartnerUserType,
    fullName: "",
    email: "",
    birthDate: "",
    shirtSize: "",
    active: true,
    createAccess: true,
    password: "",
    notes: "",
  });

  const employeeMetrics = useMemo(() => {
    const totalEmployees = employees.length;
    const activeEmployees = employees.filter((item) => item.active).length;
    const usersWithFinance = employees.filter((item) => item.permissions.financeiro).length;
    const adminUsers = employees.filter((item) => item.permissions.usuarios).length;

    return [
      {
        label: "Funcionarios",
        value: String(totalEmployees),
        detail: "Usuarios internos cadastrados para operar o sistema.",
      },
      {
        label: "Ativos",
        value: String(activeEmployees),
        detail: "Funcionarios que seguem liberados para operar.",
      },
      {
        label: "Acesso financeiro",
        value: String(usersWithFinance),
        detail: "Quantos podem ver margem, caixa e leitura financeira.",
      },
      {
        label: "Admins da area",
        value: String(adminUsers),
        detail: "Quantos podem acessar a aba de usuarios e permissoes.",
      },
    ];
  }, [employees]);

  const partnerMetrics = useMemo(() => {
    const totalPartners = partners.length;
    const athletes = partners.filter((item) => item.partnerType === "atleta").length;
    const influencers = partners.filter(
      (item) => item.partnerType === "influenciador",
    ).length;
    const withLogin = partners.filter((item) => item.hasLogin).length;
    const withStoreLink = partners.filter((item) => item.nuvemshopCustomerId).length;

    return [
      {
        label: "Parceiros cadastrados",
        value: String(totalPartners),
        detail: "Atletas, influenciadores e afiliados com dados pessoais.",
      },
      {
        label: "Influenciadores",
        value: String(influencers),
        detail: "Perfis marcados como influenciador nessa tela.",
      },
      {
        label: "Atletas",
        value: String(athletes),
        detail: "Perfis marcados como atleta e prontos para historico.",
      },
      {
        label: "Login parceiro",
        value: String(withLogin),
        detail: "Parceiros que ja tiveram acesso criado no Supabase Auth.",
      },
      {
        label: "Login loja mapeado",
        value: String(withStoreLink),
        detail: "Parceiros vinculados manualmente a um cliente da Nuvemshop.",
      },
      {
        label: "Resgates pendentes",
        value: String(pendingRequests.length),
        detail: "Solicitacoes de parceiros aguardando sua acao de admin.",
      },
    ];
  }, [partners, pendingRequests.length]);

  const selectedPartnerOption =
    initialPartnerOptions.find((item) => item.id === partnerForm.linkedPartnerId) || null;
  const selectedStoreCustomerOption =
    initialStoreCustomerOptions.find(
      (item) => item.id === partnerForm.nuvemshopCustomerId,
    ) || null;
  const partnerAge = partnerForm.birthDate ? getAgeFromDate(partnerForm.birthDate) : null;

  function getRequestDraft(request: PartnerRewardRequest) {
    return (
      requestDrafts[request.id] || {
        adminCouponCode: request.adminCouponCode || request.couponCode || "",
        adminMessage: request.adminMessage || "",
      }
    );
  }

  async function handleSaveEmployee() {
    if (!employeeForm.fullName.trim()) {
      setEmployeeFeedback("Informe o nome do funcionario.");
      return;
    }

    if (!editingEmployeeId && !employeeForm.email.trim()) {
      setEmployeeFeedback("Informe o e-mail de login do funcionario.");
      return;
    }

    setIsSavingEmployee(true);
    setEmployeeFeedback("");

    try {
      const response = await fetch(
        editingEmployeeId
          ? `/api/usuarios/funcionarios/${editingEmployeeId}`
          : "/api/usuarios/funcionarios",
        {
          method: editingEmployeeId ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(employeeForm),
        },
      );
      const result = (await response.json()) as EmployeeApiResponse;

      if (!response.ok || !result.ok || !result.employee) {
        throw new Error(
          result.message ||
            (editingEmployeeId
              ? "Nao foi possivel atualizar o funcionario."
              : "Nao foi possivel criar o funcionario."),
        );
      }

      setEmployees((current) =>
        [...current.filter((item) => item.id !== result.employee!.id), result.employee!].sort(
          (left, right) => left.fullName.localeCompare(right.fullName),
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setEmployeeForm(getDefaultEmployeeForm());
      setEditingEmployeeId(null);
      setEmployeeFeedback(
        result.message ||
          (editingEmployeeId
            ? "Acessos do funcionario atualizados com sucesso."
            : "Funcionario criado com sucesso."),
      );
    } catch (error) {
      setEmployeeFeedback(
        error instanceof Error
          ? error.message
          : editingEmployeeId
            ? "Nao foi possivel atualizar o funcionario."
            : "Nao foi possivel criar o funcionario.",
      );
    } finally {
      setIsSavingEmployee(false);
    }
  }

  function handleEditEmployee(employee: EmployeeAccessUser) {
    setEditingEmployeeId(employee.id);
    setEmployeeFeedback("");
    setEmployeeForm({
      fullName: employee.fullName,
      email: employee.email,
      password: "",
      active: employee.active,
      notes: employee.notes,
      permissions: { ...employee.permissions },
    });
  }

  function handleCancelEmployeeEdit() {
    setEditingEmployeeId(null);
    setEmployeeFeedback("");
    setEmployeeForm(getDefaultEmployeeForm());
  }

  async function handleCreatePartner() {
    if (!partnerForm.fullName.trim()) {
      setPartnerFeedback("Informe o nome do parceiro.");
      return;
    }

    if (!partnerForm.email.trim()) {
      setPartnerFeedback("Informe o e-mail do parceiro.");
      return;
    }

    if (partnerForm.nuvemshopCustomerLookup.trim() && !partnerForm.nuvemshopCustomerId) {
      setPartnerFeedback("Selecione um cliente valido da Nuvemshop na lista.");
      return;
    }

    setIsSavingPartner(true);
    setPartnerFeedback("");
    setPartnerGeneratedPassword("");

    try {
      const response = await fetch(
        editingPartnerId
          ? `/api/usuarios/parceiros/${editingPartnerId}`
          : "/api/usuarios/parceiros",
        {
          method: editingPartnerId ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partnerForm),
        },
      );
      const result = (await response.json()) as PartnerApiResponse;

      if (!response.ok || !result.ok || !result.partner) {
        throw new Error(
          result.message ||
            (editingPartnerId
              ? "Nao foi possivel atualizar o parceiro."
              : "Nao foi possivel salvar o parceiro."),
        );
      }

      if (result.generatedPassword) {
        setPartnerGeneratedPassword(result.generatedPassword);
      }

      setPartners((current) =>
        [...current.filter((item) => item.id !== result.partner!.id), result.partner!].sort((left, right) =>
          left.fullName.localeCompare(right.fullName),
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setPartnerForm({
        linkedPartnerId: "",
        nuvemshopCustomerLookup: "",
        nuvemshopCustomerId: "",
        nuvemshopCustomerName: "",
        nuvemshopCustomerEmail: "",
        partnerType: "influenciador",
        fullName: "",
        email: "",
        birthDate: "",
        shirtSize: "",
        active: true,
        createAccess: true,
        password: "",
        notes: "",
      });
      setEditingPartnerId(null);
      setPartnerFeedback(
        result.message ||
          (editingPartnerId
            ? "Parceiro atualizado com sucesso."
            : "Parceiro salvo com sucesso."),
      );
    } catch (error) {
      setPartnerFeedback(
        error instanceof Error
          ? error.message
          : editingPartnerId
            ? "Nao foi possivel atualizar o parceiro."
            : "Nao foi possivel salvar o parceiro.",
      );
    } finally {
      setIsSavingPartner(false);
    }
  }

  async function handleReviewRequest(
    request: PartnerRewardRequest,
    status: "aprovado" | "pago" | "recusado",
  ) {
    const draft = getRequestDraft(request);
    setSavingRequestId(request.id);
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
          adminMessage: draft.adminMessage,
        }),
      });
      const result = (await response.json()) as RequestReviewApiResponse;

      if (!response.ok || !result.ok) {
        throw new Error(result.message || "Nao foi possivel revisar a solicitacao.");
      }

      setPendingRequests((current) => current.filter((item) => item.id !== request.id));
      setRequestDrafts((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      setRequestFeedback(result.message || "Solicitacao atualizada com sucesso.");
    } catch (error) {
      setRequestFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel revisar a solicitacao.",
      );
    } finally {
      setSavingRequestId("");
    }
  }

  async function handleCopyPartnerPassword() {
    if (!partnerGeneratedPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(partnerGeneratedPassword);
      setPartnerFeedback("Senha copiada.");
    } catch {
      setPartnerFeedback("Nao foi possivel copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  function handleEditPartner(partner: PartnerAccessUser) {
    setEditingPartnerId(partner.id);
    setPartnerGeneratedPassword("");
    setPartnerFeedback("");
    setPartnerForm({
      linkedPartnerId: partner.linkedPartnerId || "",
      nuvemshopCustomerLookup: buildStoreCustomerLookupLabel({
        id: partner.nuvemshopCustomerId || "",
        name: partner.nuvemshopCustomerName,
        email: partner.nuvemshopCustomerEmail,
      }),
      nuvemshopCustomerId: partner.nuvemshopCustomerId || "",
      nuvemshopCustomerName: partner.nuvemshopCustomerName,
      nuvemshopCustomerEmail: partner.nuvemshopCustomerEmail,
      partnerType: partner.partnerType,
      fullName: partner.fullName,
      email: partner.email,
      birthDate: partner.birthDate || "",
      shirtSize: partner.shirtSize,
      active: partner.active,
      createAccess: true,
      password: "",
      notes: partner.notes,
    });
  }

  function handleCancelPartnerEdit() {
    setEditingPartnerId(null);
    setPartnerGeneratedPassword("");
    setPartnerFeedback("");
    setPartnerForm({
      linkedPartnerId: "",
      nuvemshopCustomerLookup: "",
      nuvemshopCustomerId: "",
      nuvemshopCustomerName: "",
      nuvemshopCustomerEmail: "",
      partnerType: "influenciador",
      fullName: "",
      email: "",
      birthDate: "",
      shirtSize: "",
      active: true,
      createAccess: true,
      password: "",
      notes: "",
    });
  }

  function toggleEmployeePermission(key: UserMenuPermissionKey) {
    setEmployeeForm((current) => ({
      ...current,
      permissions: {
        ...current.permissions,
        [key]: !current.permissions[key],
      },
    }));
  }

  function handleSelectLinkedPartner(value: string) {
    const option = initialPartnerOptions.find((item) => item.id === value) || null;

    setPartnerForm((current) => ({
      ...current,
      linkedPartnerId: value,
      fullName:
        current.fullName ||
        (option?.source === "cadastro" ? option.name : ""),
      partnerType: option?.role || current.partnerType,
    }));
  }

  function handleSelectStoreCustomer(value: string) {
    const option = findStoreCustomerOption(value, initialStoreCustomerOptions);

    setPartnerForm((current) => ({
      ...current,
      nuvemshopCustomerLookup: value,
      nuvemshopCustomerId: option?.id || "",
      nuvemshopCustomerName: option?.name || "",
      nuvemshopCustomerEmail: option?.email || "",
    }));
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Controle de acesso e perfis</div>
            <p className={styles.sectionSubtitle}>
              Aqui voce separa funcionario de parceiro, cria login quando
              precisar e salva os dados no schema `repeticao_maxima`, sem usar o
              `profiles` do outro sistema.
            </p>
          </div>
        </div>

        <div className={persistence.enabled ? styles.callout : styles.warningPanel}>
          <h3>{persistence.enabled ? "Supabase conectado" : "Persistencia em modo de exemplo"}</h3>
          <p>{employeeFeedback || partnerFeedback || persistence.message}</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Resumo da area</div>
            <p className={styles.sectionSubtitle}>
              Vista rapida para bater o olho em funcionarios internos e
              parceiros externos cadastrados.
            </p>
          </div>
        </div>

        <div className={styles.metricGrid}>
          {[...employeeMetrics, ...partnerMetrics].map((metric) => (
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
                <div className={styles.sectionTitle}>Funcionario e login</div>
                <p className={styles.sectionSubtitle}>
                  Cria o usuario interno com e-mail, senha e menus liberados.
                  Tambem permite editar os acessos e o status de quem ja existe.
                </p>
              </div>
            </div>

            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Nome</span>
                <input
                  value={employeeForm.fullName}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>E-mail de login</span>
                <input
                  type="email"
                  value={employeeForm.email}
                  disabled={Boolean(editingEmployeeId)}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              {editingEmployeeId ? (
                <div className={styles.metricHint}>
                  O login atual continua no mesmo e-mail. Aqui voce esta editando os acessos.
                </div>
              ) : (
                <label className={styles.filterField}>
                  <span>Senha</span>
                  <input
                    type="password"
                    value={employeeForm.password}
                    onChange={(event) =>
                      setEmployeeForm((current) => ({
                        ...current,
                        password: event.target.value,
                      }))
                    }
                  />
                </label>
              )}
              <label className={styles.filterField}>
                <span>Observacao</span>
                <input
                  value={employeeForm.notes}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Ex.: gerente operacional"
                />
              </label>
              <label className={styles.filterField}>
                <span>Status</span>
                <select
                  value={employeeForm.active ? "ativo" : "inativo"}
                  onChange={(event) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      active: event.target.value === "ativo",
                    }))
                  }
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </label>
            </div>

            <div className={styles.callout} style={{ marginTop: 16 }}>
              <h3>Menus liberados</h3>
              <p>Marque exatamente o que esse funcionario pode acessar no sistema.</p>
            </div>

            <div className={styles.filterGrid} style={{ marginTop: 16 }}>
              {MENU_OPTIONS.map((item) => (
                <label
                  key={item.key}
                  className={styles.secondaryButton}
                  style={{ gap: 10, cursor: "pointer", justifyContent: "flex-start" }}
                >
                  <input
                    type="checkbox"
                    checked={employeeForm.permissions[item.key]}
                    onChange={() => toggleEmployeePermission(item.key)}
                  />
                  {item.label}
                </label>
              ))}
            </div>

            <div className={styles.filterActions} style={{ marginTop: 16 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleSaveEmployee}
                disabled={!persistence.enabled || isSavingEmployee}
              >
                {isSavingEmployee
                  ? "Salvando..."
                  : editingEmployeeId
                    ? "Salvar acessos"
                    : "Criar funcionario"}
              </button>
              {editingEmployeeId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCancelEmployeeEdit}
                  disabled={isSavingEmployee}
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </article>

          <article className={styles.configCard}>
            <div className={styles.sectionHeader}>
              <div>
                <div className={styles.sectionTitle}>Parceiro e dados pessoais</div>
                <p className={styles.sectionSubtitle}>
                  Cadastro simples de atleta, influenciador ou afiliado com os
                  dados pessoais que voce realmente quer controlar.
                </p>
              </div>
            </div>

            <div className={styles.formStack}>
              <label className={styles.filterField}>
                <span>Vincular a parceiro ja cadastrado</span>
                <select
                  value={partnerForm.linkedPartnerId}
                  onChange={(event) => handleSelectLinkedPartner(event.target.value)}
                >
                  <option value="">Sem vinculo agora</option>
                  {initialPartnerOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name} · {option.couponCode}
                      {option.source === "nuvemshop" ? " · cupom sem cadastro interno" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className={styles.filterGrid}>
                <label className={styles.filterField}>
                  <span>Tipo</span>
                  <select
                    value={partnerForm.partnerType}
                    onChange={(event) =>
                      setPartnerForm((current) => ({
                        ...current,
                        partnerType: event.target.value as PartnerUserType,
                      }))
                    }
                  >
                    <option value="influenciador">Influenciador</option>
                    <option value="atleta">Atleta</option>
                    <option value="afiliado">Afiliado</option>
                  </select>
                </label>
                <label className={styles.filterField}>
                  <span>Tamanho de camiseta</span>
                  <input
                    value={partnerForm.shirtSize}
                    onChange={(event) =>
                      setPartnerForm((current) => ({
                        ...current,
                        shirtSize: event.target.value,
                      }))
                    }
                    placeholder="Ex.: M, G, GG"
                  />
                </label>
              </div>
              <label className={styles.filterField}>
                <span>Nome</span>
                <input
                  value={partnerForm.fullName}
                  onChange={(event) =>
                    setPartnerForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                />
              </label>
              <label className={styles.filterField}>
                <span>E-mail</span>
                <input
                  type="email"
                  value={partnerForm.email}
                  onChange={(event) =>
                    setPartnerForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <div className={styles.metricHint}>
                Esse e-mail vira o login do parceiro.
              </div>
              <label className={styles.filterField}>
                <span>Login da Nuvemshop vinculado</span>
                <input
                  list="nuvemshop-customers"
                  value={partnerForm.nuvemshopCustomerLookup}
                  onChange={(event) => handleSelectStoreCustomer(event.target.value)}
                  placeholder="Busque por nome, e-mail ou ID da loja"
                />
                <datalist id="nuvemshop-customers">
                  {initialStoreCustomerOptions.map((option) => (
                    <option key={option.id} value={option.lookupLabel} />
                  ))}
                </datalist>
              </label>
              <div className={styles.metricHint}>
                {selectedStoreCustomerOption
                  ? `Cliente da loja vinculado: ${selectedStoreCustomerOption.email || "sem e-mail"}${
                      selectedStoreCustomerOption.active ? "" : " · cadastro inativo"
                    }.`
                  : initialStoreCustomerOptions.length > 0
                    ? "Escolha o cliente real da loja para o saldo identificar o checkout correto."
                    : "Nenhum cliente da Nuvemshop foi carregado agora."}
              </div>
              <div className={styles.filterGrid}>
                <label className={styles.filterField}>
                  <span>Data de nascimento</span>
                  <input
                    type="date"
                    value={partnerForm.birthDate}
                    onChange={(event) =>
                      setPartnerForm((current) => ({
                        ...current,
                        birthDate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className={styles.filterField}>
                  <span>Idade</span>
                  <input value={partnerAge !== null ? String(partnerAge) : ""} disabled />
                </label>
              </div>

              <label className={styles.filterField}>
                <span>Observacao</span>
                <input
                  value={partnerForm.notes}
                  onChange={(event) =>
                    setPartnerForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Ex.: atleta de fisiculturismo / afiliado marketplace"
                />
              </label>

              <label className={styles.filterField}>
                <span>Senha (opcional)</span>
                <input
                  type="password"
                  value={partnerForm.password}
                  onChange={(event) =>
                    setPartnerForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder="Deixe vazio para gerar automaticamente"
                />
              </label>
            </div>

            {partnerGeneratedPassword ? (
              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>Senha gerada</h3>
                <p style={{ wordBreak: "break-word" }}>{partnerGeneratedPassword}</p>
                <div className={styles.filterActions} style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={handleCopyPartnerPassword}
                  >
                    Copiar
                  </button>
                </div>
              </div>
            ) : null}

            {partnerFeedback ? (
              <div className={styles.callout} style={{ marginTop: 16 }}>
                <h3>Status do cadastro</h3>
                <p>{partnerFeedback}</p>
              </div>
            ) : null}

            <div className={styles.filterActions} style={{ marginTop: 16 }}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleCreatePartner}
                disabled={!persistence.enabled || isSavingPartner}
              >
                {isSavingPartner
                  ? "Salvando..."
                  : editingPartnerId
                    ? "Salvar alteracoes"
                    : "Salvar parceiro"}
              </button>
              {editingPartnerId ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={handleCancelPartnerEdit}
                  disabled={isSavingPartner}
                >
                  Cancelar
                </button>
              ) : null}
            </div>

            <div className={styles.callout} style={{ marginTop: 16 }}>
              <h3>Leitura do parceiro</h3>
              <p>
                {selectedPartnerOption
                  ? selectedPartnerOption.source === "cadastro"
                    ? `${selectedPartnerOption.name} esta vinculado ao cupom ${selectedPartnerOption.couponCode}.`
                    : `O cupom ${selectedPartnerOption.couponCode} foi encontrado na loja e o cadastro interno sera criado ao salvar esse acesso.`
                  : "Voce pode cadastrar um parceiro novo sem vinculo de cupom agora."}
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mobileOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Solicitacoes para o admin</div>
            <p className={styles.sectionSubtitle}>
              Resgates e pedidos de apoio em leitura adaptada para celular.
            </p>
          </div>
        </div>

        {requestFeedback ? (
          <div className={styles.callout} style={{ marginBottom: 16 }}>
            <h3>Retorno do admin</h3>
            <p>{requestFeedback}</p>
          </div>
        ) : null}

        <div className={styles.mobileList}>
          {pendingRequests.length > 0 ? (
            pendingRequests.map((request) => (
              <div key={request.id} className={styles.mobileListItem}>
                <div className={styles.mobileListTitleRow}>
                  <div className={styles.mobileListTitle}>{request.partnerName}</div>
                  <span className={`${styles.pill} ${styles.pillMedium}`}>
                    {request.requestType === "apoio" ? "Apoio" : "Roupa"}
                  </span>
                </div>
                <div className={styles.mobileListMeta}>
                  <span>{request.couponCode}</span>
                  <span>{formatMoney(request.requestedAmount)}</span>
                  <span>{formatDateTime(request.requestedAt)}</span>
                </div>
                <div className={styles.mobileKeyValueList}>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Destino</strong>
                    <span>{request.supportGoal || "Cupom / roupa"}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
                  {request.requestType === "roupa" ? (
                    <label className={styles.filterField}>
                      <span>Cupom liberado</span>
                      <input
                        value={getRequestDraft(request).adminCouponCode}
                        onChange={(event) =>
                          setRequestDrafts((current) => ({
                            ...current,
                            [request.id]: {
                              ...getRequestDraft(request),
                              adminCouponCode: event.target.value.toUpperCase(),
                            },
                          }))
                        }
                        placeholder="Ex: ATLETA10"
                      />
                    </label>
                  ) : null}

                  <label className={styles.filterField}>
                    <span>Mensagem para o parceiro</span>
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
                      placeholder={
                        request.requestType === "apoio"
                          ? "Ex: pagamento programado para hoje"
                          : "Ex: cupom liberado para voce usar"
                      }
                    />
                  </label>
                </div>
                <div className={styles.filterActions} style={{ marginTop: 16 }}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={savingRequestId === request.id}
                    onClick={() =>
                      handleReviewRequest(
                        request,
                        request.requestType === "apoio" ? "pago" : "aprovado",
                      )
                    }
                  >
                    {savingRequestId === request.id
                      ? "Salvando..."
                      : request.requestType === "apoio"
                        ? "Marcar pago"
                        : "Aprovar cupom"}
                  </button>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    disabled={savingRequestId === request.id}
                    onClick={() => handleReviewRequest(request, "recusado")}
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.warningPanel}>
              <div className={styles.warningTitle}>Nenhuma solicitacao pendente</div>
              <p className={styles.warningText}>
                Quando um parceiro pedir roupa ou apoio, o item aparece aqui.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Solicitacoes para o admin</div>
            <p className={styles.sectionSubtitle}>
              Quando o parceiro clica em resgatar no painel dele, o pedido aparece aqui.
            </p>
          </div>
        </div>

        {requestFeedback ? (
          <div className={styles.callout} style={{ marginBottom: 16 }}>
            <h3>Retorno do admin</h3>
            <p>{requestFeedback}</p>
          </div>
        ) : null}

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Parceiro</th>
                <th>Cupom</th>
                <th>Tipo</th>
                <th>Destino</th>
                <th>Valor</th>
                <th>Solicitado em</th>
                <th>Aprovacao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {pendingRequests.length > 0 ? (
                pendingRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.partnerName}</td>
                    <td>{request.couponCode}</td>
                    <td>{request.requestType === "apoio" ? "Apoio" : "Roupa"}</td>
                    <td>{request.supportGoal || "Saldo / roupa"}</td>
                    <td>{formatMoney(request.requestedAmount)}</td>
                    <td>{formatDateTime(request.requestedAt)}</td>
                    <td>
                      <div style={{ display: "grid", gap: 10, minWidth: 240 }}>

                        {request.requestType === "roupa" ? (
                          <label className={styles.filterField}>
                            <span>Cupom liberado</span>
                            <input
                              value={getRequestDraft(request).adminCouponCode}
                              onChange={(event) =>
                                setRequestDrafts((current) => ({
                                  ...current,
                                  [request.id]: {
                                    ...getRequestDraft(request),
                                    adminCouponCode: event.target.value.toUpperCase(),
                                  },
                                }))
                              }
                              placeholder="Ex: ATLETA10"
                            />
                          </label>
                        ) : null}
                        <label className={styles.filterField}>
                          <span>Mensagem para o parceiro</span>
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
                            placeholder={
                              request.requestType === "apoio"
                                ? "Ex: pagamento programado para hoje"
                                : "Ex: saldo aprovado para voce usar na loja"
                            }
                          />
                        </label>
                      </div>
                    </td>
                    <td>
                      <div className={styles.filterActions} style={{ minWidth: 220 }}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          disabled={savingRequestId === request.id}
                          onClick={() =>
                            handleReviewRequest(
                              request,
                              request.requestType === "apoio" ? "pago" : "aprovado",
                            )
                          }
                        >
                          {savingRequestId === request.id
                            ? "Salvando..."
                            : request.requestType === "apoio"
                              ? "Marcar pago"
                              : "Aprovar saldo"}
                        </button>
                        <button
                          type="button"
                          className={styles.secondaryButton}
                          disabled={savingRequestId === request.id}
                          onClick={() => handleReviewRequest(request, "recusado")}
                        >
                          Recusar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>Nenhuma solicitacao pendente agora.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mobileOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Funcionarios cadastrados</div>
            <p className={styles.sectionSubtitle}>
              Lista compacta com status, menus liberados e observacoes.
            </p>
          </div>
        </div>

        <div className={styles.mobileList}>
          {employees.length > 0 ? (
            employees.map((employee) => (
              <details key={employee.id} className={styles.mobileListItem}>
                <summary className={styles.mobileListSummary}>
                  <div className={styles.mobileListTitleRow}>
                    <div className={styles.mobileListTitle}>{employee.fullName}</div>
                    <span
                      className={`${styles.pill} ${
                        employee.active ? styles.pillLow : styles.pillMedium
                      }`}
                    >
                      {employee.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <div className={styles.mobileListMeta}>
                    <span>{employee.email}</span>
                  </div>
                </summary>
                <div className={styles.mobileKeyValueList}>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Menus</strong>
                    <span>{formatPermissions(employee.permissions)}</span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Observacao</strong>
                    <span>{employee.notes || "-"}</span>
                  </div>
                </div>
              </details>
            ))
          ) : (
            <div className={styles.warningPanel}>
              <div className={styles.warningTitle}>Sem funcionarios cadastrados</div>
              <p className={styles.warningText}>
                Os acessos internos criados aparecem aqui automaticamente.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Funcionarios cadastrados</div>
            <p className={styles.sectionSubtitle}>
              Lista dos logins internos criados com os menus liberados para cada um.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Status</th>
                <th>Menus</th>
                <th>Observacao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {employees.length > 0 ? (
                employees.map((employee) => (
                  <tr key={employee.id}>
                    <td>{employee.fullName}</td>
                    <td>{employee.email}</td>
                    <td>{employee.active ? "Ativo" : "Inativo"}</td>
                    <td>{formatPermissions(employee.permissions)}</td>
                    <td>{employee.notes || "-"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleEditEmployee(employee)}
                      >
                        Editar acessos
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhum funcionario cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={`${styles.section} ${styles.mobileOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Parceiros cadastrados</div>
            <p className={styles.sectionSubtitle}>
              Base pessoal com leitura melhor para consultar e editar pelo celular.
            </p>
          </div>
        </div>

        <div className={styles.mobileList}>
          {partners.length > 0 ? (
            partners.map((partner) => (
              <details key={partner.id} className={styles.mobileListItem}>
                <summary className={styles.mobileListSummary}>
                  <div className={styles.mobileListTitleRow}>
                    <div className={styles.mobileListTitle}>{partner.fullName}</div>
                    <span className={`${styles.pill} ${styles.pillMedium}`}>
                      {labelForPartnerType(partner.partnerType)}
                    </span>
                  </div>
                  <div className={styles.mobileListMeta}>
                    <span>{partner.email}</span>
                    <span>{partner.hasLogin ? "Login criado" : "Sem login"}</span>
                  </div>
                </summary>
                <div className={styles.mobileKeyValueList}>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Idade</strong>
                    <span>{partner.age !== null ? `${partner.age} anos` : "-"}</span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Camiseta</strong>
                    <span>{partner.shirtSize || "-"}</span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Cupom</strong>
                    <span>{partner.linkedCouponCode || "-"}</span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Ultimo acesso</strong>
                    <span>
                      {partner.lastSeenAt ? formatDateTime(partner.lastSeenAt) : "-"}
                    </span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Vinculo</strong>
                    <span>{partner.linkedPartnerName || "-"}</span>
                  </div>
                  <div className={styles.mobileKeyValueRow}>
                    <strong>Login loja</strong>
                    <span>
                      {partner.nuvemshopCustomerEmail ||
                        partner.nuvemshopCustomerName ||
                        (partner.nuvemshopCustomerId
                          ? `#${partner.nuvemshopCustomerId}`
                          : "-")}
                    </span>
                  </div>
                </div>
                <div className={styles.mobileListActions}>
                  <button
                    type="button"
                    className={styles.secondaryButton}
                    onClick={() => handleEditPartner(partner)}
                  >
                    Editar
                  </button>
                </div>
              </details>
            ))
          ) : (
            <div className={styles.warningPanel}>
              <div className={styles.warningTitle}>Sem parceiros cadastrados</div>
              <p className={styles.warningText}>
                Cadastre atletas, influenciadores e afiliados para operar por aqui.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className={`${styles.section} ${styles.desktopOnly}`}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Parceiros cadastrados</div>
            <p className={styles.sectionSubtitle}>
              Base pessoal dos atletas, influenciadores e afiliados para futuro
              portal, pagamentos e historico.
            </p>
          </div>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Tipo</th>
                <th>E-mail</th>
                <th>Idade</th>
                <th>Camiseta</th>
                <th>Cupom</th>
                <th>Login</th>
                <th>Login loja</th>
                <th>Ultimo acesso</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {partners.length > 0 ? (
                partners.map((partner) => (
                  <tr key={partner.id}>
                    <td>
                      {partner.fullName}
                      {partner.linkedPartnerName ? (
                        <>
                          <br />
                          Vinculo: {partner.linkedPartnerName}
                        </>
                      ) : null}
                    </td>
                    <td>{labelForPartnerType(partner.partnerType)}</td>
                    <td>{partner.email}</td>
                    <td>{partner.age !== null ? `${partner.age} anos` : "-"}</td>
                    <td>{partner.shirtSize || "-"}</td>
                    <td>{partner.linkedCouponCode || "-"}</td>
                    <td>{partner.hasLogin ? "Criado" : "Ainda nao"}</td>
                    <td>
                      {partner.nuvemshopCustomerEmail ||
                        partner.nuvemshopCustomerName ||
                        (partner.nuvemshopCustomerId
                          ? `#${partner.nuvemshopCustomerId}`
                          : "-")}
                    </td>
                    <td>{partner.lastSeenAt ? formatDateTime(partner.lastSeenAt) : "-"}</td>
                    <td>
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => handleEditPartner(partner)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>Nenhum parceiro cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function formatPermissions(permissions: UserMenuPermissions) {
  const selected = MENU_OPTIONS.filter((item) => permissions[item.key]).map(
    (item) => item.label,
  );

  return selected.length > 0 ? selected.join(", ") : "Sem menu liberado";
}

function labelForPartnerType(value: PartnerUserType) {
  switch (value) {
    case "atleta":
      return "Atleta";
    case "afiliado":
      return "Afiliado";
    default:
      return "Influenciador";
  }
}

function getAgeFromDate(value: string) {
  const birthDate = new Date(`${value}T00:00:00`);

  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const hasBirthdayPassed =
    now.getMonth() > birthDate.getMonth() ||
    (now.getMonth() === birthDate.getMonth() &&
      now.getDate() >= birthDate.getDate());

  if (!hasBirthdayPassed) {
    age -= 1;
  }

  return Math.max(age, 0);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function buildStoreCustomerLookupLabel(customer: {
  id: string;
  name?: string | null;
  email?: string | null;
}) {
  const id = String(customer.id ?? "").trim();

  if (!id) {
    return "";
  }

  const name = String(customer.name ?? "").trim();
  const email = String(customer.email ?? "").trim().toLowerCase();
  const title = name || email || `Cliente ${id}`;
  return `${title} · ${email || "sem email"} · #${id}`;
}

function findStoreCustomerOption(
  value: string,
  options: UserStoreCustomerOption[],
) {
  const normalized = value.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    options.find((option) =>
      [
        option.lookupLabel,
        option.email,
        option.id,
        option.name,
        `#${option.id}`,
      ].some((candidate) => candidate.trim().toLowerCase() === normalized),
    ) || null
  );
}
