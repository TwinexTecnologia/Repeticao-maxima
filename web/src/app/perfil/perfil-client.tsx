"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "@/components/panel.module.css";

type PerfilApiResponse =
  | {
      ok: true;
      profile: {
        fullName: string;
        email: string;
        active: boolean;
        userType: "funcionario" | "parceiro" | "desconhecido";
        partnerType: "influenciador" | "atleta" | "afiliado" | null;
        birthDate: string | null;
        shirtSize: string;
        linkedCouponCode: string;
        linkedPartnerName: string;
        photoUrl: string;
      };
    }
  | {
      ok: false;
      message: string;
    };

type PasswordMode = "manual" | "random";

export function PerfilClient() {
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profile, setProfile] = useState<PerfilApiResponse | null>(null);

  const [birthDateDraft, setBirthDateDraft] = useState("");
  const [birthDateFeedback, setBirthDateFeedback] = useState("");
  const [isUpdatingBirthDate, setIsUpdatingBirthDate] = useState(false);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoFeedback, setPhotoFeedback] = useState("");
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const [passwordMode, setPasswordMode] = useState<PasswordMode>("manual");
  const [manualPassword, setManualPassword] = useState("");
  const [passwordFeedback, setPasswordFeedback] = useState("");
  const [generatedPassword, setGeneratedPassword] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const loadedProfile = useMemo(() => {
    if (!profile || !profile.ok) {
      return null;
    }
    return profile.profile;
  }, [profile]);

  useEffect(() => {
    if (loadedProfile?.userType === "parceiro") {
      setBirthDateDraft(loadedProfile.birthDate || "");
    }
  }, [loadedProfile]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setLoadError("");

      try {
        const response = await fetch("/api/perfil", { method: "GET" });
        const data = (await response.json()) as PerfilApiResponse;

        if (!response.ok || !data.ok) {
          throw new Error("message" in data ? data.message : "Nao foi possivel carregar o perfil.");
        }

        if (!cancelled) {
          setProfile(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Nao foi possivel carregar o perfil.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleUploadPhoto(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPhotoFeedback("");

    if (!photoFile) {
      setPhotoFeedback("Escolha uma imagem antes de enviar.");
      return;
    }

    setIsUploadingPhoto(true);
    setGeneratedPassword("");
    setPasswordFeedback("");

    try {
      const formData = new FormData();
      formData.append("file", photoFile);

      const response = await fetch("/api/perfil/foto", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as
        | { ok: true; photoUrl: string }
        | { ok: false; message: string };

      if (!response.ok || !data.ok) {
        throw new Error("message" in data ? data.message : "Nao foi possivel enviar a foto.");
      }

      setPhotoFeedback("Foto atualizada.");
      setPhotoFile(null);

      if (loadedProfile) {
        setProfile({
          ok: true,
          profile: {
            ...loadedProfile,
            photoUrl: data.photoUrl,
          },
        });
      }
    } catch (error) {
      setPhotoFeedback(error instanceof Error ? error.message : "Nao foi possivel enviar a foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  async function handleUpdateBirthDate() {
    setBirthDateFeedback("");
    setPasswordFeedback("");
    setGeneratedPassword("");
    setPhotoFeedback("");

    setIsUpdatingBirthDate(true);

    try {
      const response = await fetch("/api/perfil", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: birthDateDraft || null,
        }),
      });

      const data = (await response.json()) as
        | { ok: true; birthDate: string | null }
        | { ok: false; message: string };

      if (!response.ok || !data.ok) {
        throw new Error("message" in data ? data.message : "Nao foi possivel atualizar seu perfil.");
      }

      if (loadedProfile) {
        setProfile({
          ok: true,
          profile: {
            ...loadedProfile,
            birthDate: data.birthDate,
          },
        });
      }

      setBirthDateFeedback("Data de nascimento atualizada.");
    } catch (error) {
      setBirthDateFeedback(
        error instanceof Error ? error.message : "Nao foi possivel atualizar seu perfil.",
      );
    } finally {
      setIsUpdatingBirthDate(false);
    }
  }

  async function handleUpdatePassword() {
    setPasswordFeedback("");
    setGeneratedPassword("");
    setPhotoFeedback("");

    if (passwordMode === "manual" && manualPassword.trim().length < 6) {
      setPasswordFeedback("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const response = await fetch("/api/perfil/senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: passwordMode,
          password: passwordMode === "manual" ? manualPassword : undefined,
        }),
      });

      const data = (await response.json()) as
        | { ok: true; password?: string }
        | { ok: false; message: string };

      if (!response.ok || !data.ok) {
        throw new Error("message" in data ? data.message : "Nao foi possivel trocar a senha.");
      }

      if (data.password) {
        setGeneratedPassword(data.password);
      }

      setManualPassword("");
      setPasswordFeedback(
        data.password ? "Senha aleatoria gerada e aplicada." : "Senha atualizada.",
      );
    } catch (error) {
      setPasswordFeedback(error instanceof Error ? error.message : "Nao foi possivel trocar a senha.");
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  async function handleCopyGeneratedPassword() {
    if (!generatedPassword) {
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedPassword);
      setPasswordFeedback("Senha copiada.");
    } catch {
      setPasswordFeedback("Nao foi possivel copiar automaticamente. Selecione e copie manualmente.");
    }
  }

  if (isLoading) {
    return (
      <div className={styles.callout}>
        <h3>Carregando perfil</h3>
        <p>Aguarde um instante.</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={styles.warningPanel}>
        <div className={styles.warningTitle}>Erro ao carregar perfil</div>
        <p className={styles.warningText}>{loadError}</p>
      </div>
    );
  }

  if (!loadedProfile) {
    return (
      <div className={styles.warningPanel}>
        <div className={styles.warningTitle}>Perfil indisponivel</div>
        <p className={styles.warningText}>Nao foi possivel encontrar seus dados.</p>
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      <div className={styles.heroCompact}>
        <article className={styles.heroCard}>
          <h2>Seus dados</h2>
          <p>Informacoes usadas para identificar seu acesso no painel.</p>

          <div className={styles.list} style={{ marginTop: 16 }}>
            <div className={styles.listItem}>
              <div className={styles.listTitleRow}>
                <div className={styles.listTitle}>Nome</div>
              </div>
              <p className={styles.listDetail}>{loadedProfile.fullName}</p>
            </div>
            <div className={styles.listItem}>
              <div className={styles.listTitleRow}>
                <div className={styles.listTitle}>E-mail</div>
              </div>
              <p className={styles.listDetail}>{loadedProfile.email}</p>
            </div>
            <div className={styles.listItem}>
              <div className={styles.listTitleRow}>
                <div className={styles.listTitle}>Tipo</div>
              </div>
              <p className={styles.listDetail}>
                {loadedProfile.userType === "parceiro"
                  ? loadedProfile.partnerType || "Parceiro"
                  : loadedProfile.userType}
              </p>
            </div>
            {loadedProfile.userType === "parceiro" ? (
              <>
                <div className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>Nascimento</div>
                  </div>
                  <p className={styles.listDetail}>{loadedProfile.birthDate || "—"}</p>
                </div>
                <div className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>Camiseta</div>
                  </div>
                  <p className={styles.listDetail}>{loadedProfile.shirtSize || "—"}</p>
                </div>
                <div className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>Cupom</div>
                  </div>
                  <p className={styles.listDetail}>{loadedProfile.linkedCouponCode || "—"}</p>
                </div>
                <div className={styles.listItem}>
                  <div className={styles.listTitleRow}>
                    <div className={styles.listTitle}>Parceiro</div>
                  </div>
                  <p className={styles.listDetail}>{loadedProfile.linkedPartnerName || "—"}</p>
                </div>
              </>
            ) : null}
          </div>
        </article>

        <div className={styles.stack}>
          <article className={styles.metricCard}>
            <div className={styles.metricLabel}>Foto</div>
            <div style={{ marginTop: 10 }}>
              {loadedProfile.photoUrl ? (
                <img
                  src={loadedProfile.photoUrl}
                  alt="Foto do perfil"
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 16,
                    objectFit: "cover",
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 96,
                    height: 96,
                    borderRadius: 16,
                    border: "1px solid rgba(255,255,255,0.12)",
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(255,255,255,0.7)",
                  }}
                >
                  —
                </div>
              )}
            </div>
            <div className={styles.metricHint} style={{ marginTop: 10 }}>
              Sua foto aparece no seu perfil.
            </div>
          </article>
        </div>
      </div>

      {loadedProfile.userType === "parceiro" ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <div>
              <div className={styles.sectionTitle}>Atualizar nascimento</div>
              <p className={styles.sectionSubtitle}>
                Voce pode ajustar sua data de nascimento para manter seus dados atualizados.
              </p>
            </div>
          </div>

          <div className={styles.filterGrid}>
            <label className={styles.filterField}>
              <span>Data de nascimento</span>
              <input
                type="date"
                value={birthDateDraft}
                onChange={(event) => setBirthDateDraft(event.target.value)}
                disabled={isUpdatingBirthDate}
              />
            </label>
            <div className={styles.filterActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handleUpdateBirthDate}
                disabled={isUpdatingBirthDate}
              >
                {isUpdatingBirthDate ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>

          {birthDateFeedback ? (
            <div className={styles.callout} style={{ marginTop: 16 }}>
              <h3>Status</h3>
              <p>{birthDateFeedback}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Atualizar foto</div>
            <p className={styles.sectionSubtitle}>
              Envie uma imagem para usar como foto do perfil.
            </p>
          </div>
        </div>

        <form className={styles.filterGrid} onSubmit={handleUploadPhoto}>
          <label className={styles.filterField}>
            <span>Imagem</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => setPhotoFile(event.target.files?.[0] || null)}
              disabled={isUploadingPhoto}
            />
          </label>
          <div className={styles.filterActions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={isUploadingPhoto}
            >
              {isUploadingPhoto ? "Enviando..." : "Enviar foto"}
            </button>
          </div>
        </form>

        {photoFeedback ? (
          <div className={styles.callout} style={{ marginTop: 16 }}>
            <h3>Status</h3>
            <p>{photoFeedback}</p>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <div>
            <div className={styles.sectionTitle}>Trocar senha</div>
            <p className={styles.sectionSubtitle}>
              Voce pode definir uma senha manual ou gerar uma aleatoria.
            </p>
          </div>
        </div>

        <div className={styles.filterGrid}>
          <label className={styles.secondaryButton} style={{ gap: 10, cursor: "pointer" }}>
            <input
              type="radio"
              name="passwordMode"
              value="manual"
              checked={passwordMode === "manual"}
              onChange={() => setPasswordMode("manual")}
              disabled={isUpdatingPassword}
            />
            Definir manual
          </label>
          <label className={styles.secondaryButton} style={{ gap: 10, cursor: "pointer" }}>
            <input
              type="radio"
              name="passwordMode"
              value="random"
              checked={passwordMode === "random"}
              onChange={() => setPasswordMode("random")}
              disabled={isUpdatingPassword}
            />
            Gerar aleatoria
          </label>
        </div>

        {passwordMode === "manual" ? (
          <div className={styles.filterGrid} style={{ marginTop: 12 }}>
            <label className={styles.filterField}>
              <span>Nova senha</span>
              <input
                type="password"
                value={manualPassword}
                onChange={(event) => setManualPassword(event.target.value)}
                disabled={isUpdatingPassword}
              />
            </label>
          </div>
        ) : null}

        <div className={styles.filterActions} style={{ marginTop: 12 }}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={handleUpdatePassword}
            disabled={isUpdatingPassword}
          >
            {isUpdatingPassword ? "Atualizando..." : "Aplicar nova senha"}
          </button>
        </div>

        {generatedPassword ? (
          <div className={styles.callout} style={{ marginTop: 16 }}>
            <h3>Senha gerada</h3>
            <p style={{ wordBreak: "break-word" }}>{generatedPassword}</p>
            <div className={styles.filterActions} style={{ marginTop: 10 }}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={handleCopyGeneratedPassword}
              >
                Copiar
              </button>
            </div>
          </div>
        ) : null}

        {passwordFeedback ? (
          <div className={styles.callout} style={{ marginTop: 16 }}>
            <h3>Status</h3>
            <p>{passwordFeedback}</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
