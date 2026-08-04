import type { ReactNode } from 'react';
import type { AppConfig } from '../types';

export interface PanelProps {
  config: AppConfig;
  update: (fn: (draft: AppConfig) => AppConfig) => void;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row small" style={{ cursor: 'pointer', marginBottom: 10 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  suffix,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="row">
        <input
          className="input"
          style={{ width: 120 }}
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
        />
        {suffix && <span className="small muted">{suffix}</span>}
      </div>
    </Field>
  );
}

/** ファイル取り込みボタン付きのアセット欄 */
export function AssetPicker({
  label,
  value,
  onChange,
  filters,
  hint,
}: {
  label: string;
  value: string | null;
  onChange: (rel: string | null) => void;
  filters: Electron.FileFilter[];
  hint?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="row">
        <input className="input mono small" readOnly value={value ?? '未設定'} />
        <button
          className="btn"
          onClick={async () => {
            const rel = await window.api.asset.import(filters);
            if (rel) onChange(rel);
          }}
        >
          選択…
        </button>
        {value && (
          <button className="btn ghost sm" onClick={() => onChange(null)}>
            解除
          </button>
        )}
      </div>
    </Field>
  );
}
