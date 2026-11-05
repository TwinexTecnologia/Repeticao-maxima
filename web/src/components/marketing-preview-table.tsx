"use client";

import { useMemo, useState } from "react";

import styles from "./panel.module.css";

type PreviewCell = {
  primary: string;
  secondary?: string;
  href?: string;
  hrefLabel?: string;
};

type PreviewRow = {
  id: string;
  cells: PreviewCell[];
};

type MarketingPreviewTableProps = {
  headers: string[];
  rows: PreviewRow[];
  previewLabel: string;
};

const INITIAL_VISIBLE_ROWS = 5;
const INCREMENT_ROWS = 10;

export function MarketingPreviewTable({
  headers,
  rows,
  previewLabel,
}: MarketingPreviewTableProps) {
  const [visibleRows, setVisibleRows] = useState(INITIAL_VISIBLE_ROWS);
  const shownRows = useMemo(() => rows.slice(0, visibleRows), [rows, visibleRows]);
  const remainingRows = Math.max(rows.length - shownRows.length, 0);

  return (
    <>
      <div className={styles.callout}>
        <h3>Preview da planilha</h3>
        <p>
          A tela mostra {shownRows.length} de {rows.length} linhas. {previewLabel}
        </p>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {headers.map((header) => (
                <th key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shownRows.map((row) => (
              <tr key={row.id}>
                {row.cells.map((cell, index) => (
                  <td
                    key={`${row.id}-${headers[index] ?? index}`}
                    className={cell.secondary || cell.href ? styles.tableCellTight : undefined}
                  >
                    {cell.href ? (
                      <div className={styles.tableCellTight}>
                        <strong>{cell.primary}</strong>
                        <div>
                          <a
                            href={cell.href}
                            target="_blank"
                            rel="noreferrer"
                            className={styles.tableLink}
                          >
                            {cell.hrefLabel || "Abrir"}
                          </a>
                        </div>
                      </div>
                    ) : cell.secondary ? (
                      <div className={styles.tableCellTight}>
                        <strong>{cell.primary}</strong>
                        <div>{cell.secondary}</div>
                      </div>
                    ) : (
                      cell.primary
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remainingRows > 0 ? (
        <div className={styles.previewFooter}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() =>
              setVisibleRows((current) => Math.min(current + INCREMENT_ROWS, rows.length))
            }
          >
            Ver mais 10
          </button>
          <span className={styles.previewMeta}>
            Ainda faltam {remainingRows} linhas no preview. A exportacao leva tudo.
          </span>
        </div>
      ) : rows.length > INITIAL_VISIBLE_ROWS ? (
        <div className={styles.previewFooter}>
          <span className={styles.previewMeta}>Preview completo carregado na tela.</span>
        </div>
      ) : null}
    </>
  );
}
