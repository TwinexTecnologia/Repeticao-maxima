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
} from "@/lib/usuarios/repository";

type UsuariosClientProps = {
  initialEmployees: EmployeeAccessUser[];
  initialPartners: PartnerAccessUser[];
  initialPartnerOptions: UserPartnerOption[];
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

export function UsuariosClient({
  initialEmployees,
  initialPartners,
  initialPartnerOptions,
  initialPersistence,
  initialPendingRequests,
}: UsuariosClientProps) {
  const [employees, setEmployees] = useState(initialEmployees);
  const [partners, setPartners] = useState(initialPartners);
  const [pendingRequests] = useState(initialPendingRequests);
  const [persistence, setPersistence] =
    useState<UserAccessPersistenceState>(initialPersistence);
  const [employeeFeedback, setEmployeeFeedback] = useState("");
  const [partnerFeedback, setPartnerFeedback] = useState("");
  const [partnerGeneratedPassword, setPartnerGeneratedPassword] = useState("");
  const [isSavingEmployee, setIsSavingEmployee] = useState(false);
  const [isSavingPartner, setIsSavingPartner] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<string | null>(null);
  const [employeeForm, setEmployeeForm] = useState({
    fullName: "",
    email: "",
    password: "",
    notes: "",
    permissions: { ...DEFAULT_PERMISSIONS },
  });
  const [partnerForm, setPartnerForm] = useState({
    linkedPartnerId: "",
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
        label: "Resgates pendentes",
        value: String(pendingRequests.length),
        detail: "Solicitacoes de parceiros aguardando sua acao de admin.",
      },
    ];
  }, [partners, pendingRequests.length]);

  const selectedPartnerOption =
    initialPartnerOptions.find((item) => item.id === partnerForm.linkedPartnerId) || null;
  const partnerAge = partnerForm.birthDate ? getAgeFromDate(partnerForm.birthDate) : null;

  async function handleCreateEmployee() {
    setIsSavingEmployee(true);
    setEmployeeFeedback("");

    try {
      const response = await fetch("/api/usuarios/funcionarios", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(employeeForm),
      });
      const result = (await response.json()) as EmployeeApiResponse;

      if (!response.ok || !result.ok || !result.employee) {
        throw new Error(result.message || "Nao foi possivel criar o funcionario.");
      }

      setEmployees((current) =>
        [...current, result.employee!].sort((left, right) =>
          left.fullName.localeCompare(right.fullName),
        ),
      );
      if (result.persistence) {
        setPersistence(result.persistence);
      }
      setEmployeeForm({
        fullName: "",
        email: "",
        password: "",
        notes: "",
        permissions: { ...DEFAULT_PERMISSIONS },
      });
      setEmployeeFeedback(result.message || "Funcionario criado com sucesso.");
    } catch (error) {
      setEmployeeFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel criar o funcionario.",
      );
    } finally {
      setIsSavingEmployee(false);
    }
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

    setIsSavingPartner(true);
    setPartnerFeedback("");
    setPartnerGeneratedPassword("");

    try {
      const response = await fetch("/api/usuarios/parceiros", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(partnerForm),
      });
      const result = (await response.json()) as PartnerApiResponse;

      if (!response.ok || !result.ok || !result.partner) {
        throw new Error(result.message || "Nao foi possivel salvar o parceiro.");
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
      setPartnerFeedback(result.message || "Parceiro salvo com sucesso.");
    } catch (error) {
      setPartnerFeedback(
        error instanceof Error
          ? error.message
          : "Nao foi possivel salvar o parceiro.",
      );
    } finally {
      setIsSavingPartner(false);
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
      fullName: current.fullName || option?.name || "",
      partnerType: option?.role || current.partnerType,
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
                  onChange={(event) =>
                    setEmployeeForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
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
                onClick={handleCreateEmployee}
                disabled={!persistence.enabled || isSavingEmployee}
              >
                {isSavingEmployee ? "Salvando..." : "Criar funcionario"}
              </button>
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
                  ? `${selectedPartnerOption.name} esta vinculado ao cupom ${selectedPartnerOption.couponCode}.`
                  : "Voce pode cadastrar um parceiro novo sem vinculo de cupom agora."}
              </p>
            </div>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Solicitacoes para o admin</div>
            <p className={styles.sectionSubtitle}>
              Quando o parceiro clica em resgatar no painel dele, o pedido aparece aqui.
            </p>
          </div>
        </div>

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
              </tr>
            </thead>
            <tbody>
              {pendingRequests.length > 0 ? (
                pendingRequests.map((request) => (
                  <tr key={request.id}>
                    <td>{request.partnerName}</td>
                    <td>{request.couponCode}</td>
                    <td>{request.requestType === "apoio" ? "Apoio" : "Roupa"}</td>
                    <td>{request.supportGoal || "Cupom / roupa"}</td>
                    <td>{formatMoney(request.requestedAmount)}</td>
                    <td>{formatDateTime(request.requestedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>Nenhuma solicitacao pendente agora.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
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
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5}>Nenhum funcionario cadastrado ainda.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
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
                  <td colSpan={9}>Nenhum parceiro cadastrado ainda.</td>
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
