"use client";

import { useEffect, useMemo, useState } from "react";

import styles from "./panel.module.css";
import type { FinanceCategoryGroup } from "@/lib/operacoes/repository";

type FinanceGroupSubgroupFieldsProps = {
  groups: FinanceCategoryGroup[];
  initialGroupId?: string;
  initialSubgroupId?: string;
};

export function FinanceGroupSubgroupFields({
  groups,
  initialGroupId,
  initialSubgroupId,
}: FinanceGroupSubgroupFieldsProps) {
  const defaultGroupId = initialGroupId || groups[0]?.id || "";
  const [selectedGroupId, setSelectedGroupId] = useState(defaultGroupId);
  const [selectedSubgroupId, setSelectedSubgroupId] = useState(initialSubgroupId || "");

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );
  const availableSubgroups = selectedGroup?.subgroups.filter((subgroup) => subgroup.active) ?? [];

  useEffect(() => {
    const subgroupStillAvailable = availableSubgroups.some(
      (subgroup) => subgroup.id === selectedSubgroupId,
    );

    if (!subgroupStillAvailable) {
      setSelectedSubgroupId("");
    }
  }, [availableSubgroups, selectedSubgroupId]);

  return (
    <>
      <label className={styles.filterField}>
        <span>Grupo</span>
        <select
          name="groupId"
          value={selectedGroupId}
          onChange={(event) => setSelectedGroupId(event.target.value)}
          required
        >
          <option value="">
            {groups.length > 0
              ? "Selecione o grupo"
              : "Cadastre um grupo antes de registrar"}
          </option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.filterField}>
        <span>Subgrupo</span>
        <select
          name="subgroupId"
          value={selectedSubgroupId}
          onChange={(event) => setSelectedSubgroupId(event.target.value)}
          disabled={!selectedGroupId}
        >
          <option value="">
            {!selectedGroupId
              ? "Selecione primeiro o grupo"
              : availableSubgroups.length > 0
                ? "Sem subgrupo"
                : "Esse grupo nao tem subgrupo cadastrado"}
          </option>
          {availableSubgroups.map((subgroup) => (
            <option key={subgroup.id} value={subgroup.id}>
              {subgroup.name}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
