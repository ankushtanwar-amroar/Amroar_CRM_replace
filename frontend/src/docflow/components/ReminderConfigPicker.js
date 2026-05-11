/**
 * ReminderConfigPicker — Phase 81.24/81.25/81.26
 *
 * Per-recipient pending-signature reminder configuration. Used in:
 *   - GenerateDocumentWizard.js  (Template Send → Configure Recipients)
 *   - SendPackagePage.js          (Package Send → Configure Recipients)
 *
 * Value shape (matches backend `reminder_config`):
 *   {
 *     enabled: bool,
 *     frequency_type: 'preset' | 'custom',   // explicit selection from dropdown
 *     interval_value: int,
 *     interval_unit: 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years',
 *     max_count: int | null,
 *     end_at: ISO8601 | null,
 *   }
 */
import React, { useMemo } from 'react';
import { BellRing } from 'lucide-react';

const PRESETS = [
  { id: 'every-day',      label: 'Every 1 Day',     interval_value: 1, interval_unit: 'days' },
  { id: 'every-2-days',   label: 'Every 2 Days',    interval_value: 2, interval_unit: 'days' },
  { id: 'every-3-days',   label: 'Every 3 Days',    interval_value: 3, interval_unit: 'days' },
  { id: 'weekly',         label: 'Weekly',          interval_value: 1, interval_unit: 'weeks' },
  { id: 'monthly',        label: 'Monthly',         interval_value: 1, interval_unit: 'months' },
  { id: 'custom',         label: 'Custom',          interval_value: 0, interval_unit: '' },
];

const UNIT_OPTIONS = [
  { value: 'seconds', label: 'Seconds' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours',   label: 'Hours' },
  { value: 'days',    label: 'Days' },
  { value: 'weeks',   label: 'Weeks' },
  { value: 'months',  label: 'Months' },
  { value: 'years',   label: 'Years' },
];

const DEFAULT_CONFIG = {
  enabled: false,
  frequency_type: 'preset',
  interval_value: 1,
  interval_unit: 'days',
  max_count: null,
  end_at: null,
};

// Phase 81.26 — `frequency_type` is now the source of truth for the dropdown
// selection. When user picks Custom we set frequency_type='custom' so the
// dropdown stays on "Custom" even when the value/unit pair happens to match
// a preset (e.g. 1 + months ≈ Monthly).
const matchPreset = (cfg) => {
  if (!cfg) return 'every-day';
  if (cfg.frequency_type === 'custom') return 'custom';
  const found = PRESETS.find(p =>
    p.interval_value === cfg.interval_value && p.interval_unit === cfg.interval_unit
  );
  return found ? found.id : 'custom';
};

const formatSummary = (cfg) => {
  const v = Math.max(1, parseInt(cfg.interval_value || 1, 10));
  const u = (cfg.interval_unit || 'days').toLowerCase();
  const noun = v === 1 && u.endsWith('s') ? u.slice(0, -1) : u;
  return `Email this recipient every ${v} ${noun} until signed`;
};

export default function ReminderConfigPicker({ value, onChange, idx, dataTestPrefix = 'reminder' }) {
  const cfg = useMemo(() => ({ ...DEFAULT_CONFIG, ...(value || {}) }), [value]);
  const presetId = matchPreset(cfg);

  const setField = (patch) => onChange({ ...cfg, ...patch });

  const onPresetChange = (id) => {
    if (id === 'custom') {
      // Phase 81.26 — Tag the config as `frequency_type: 'custom'` so the
      // dropdown stays on Custom regardless of the underlying value/unit
      // pair. Seed sensible defaults if the user hasn't picked Custom before.
      setField({
        frequency_type: 'custom',
        interval_value: cfg.interval_value || 1,
        interval_unit: cfg.interval_unit || 'days',
      });
      return;
    }
    const p = PRESETS.find(x => x.id === id);
    if (p) {
      setField({
        frequency_type: 'preset',
        interval_value: p.interval_value,
        interval_unit: p.interval_unit,
      });
    }
  };

  return (
    <div
      className="rounded-lg border border-gray-200 bg-gray-50/60 p-3"
      data-testid={`${dataTestPrefix}-section-${idx}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-50 shrink-0">
            <BellRing className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-gray-800">Pending-Signature Reminders</p>
            <p className="text-[10px] text-gray-500 truncate">
              {cfg.enabled
                ? formatSummary(cfg)
                : 'Off — no automatic follow-ups will be sent'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setField({ enabled: !cfg.enabled })}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${cfg.enabled ? 'bg-amber-500' : 'bg-gray-200'}`}
          aria-pressed={cfg.enabled}
          aria-label="Toggle reminders"
          data-testid={`${dataTestPrefix}-toggle-${idx}`}
        >
          <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform"
            style={{ transform: cfg.enabled ? 'translateX(18px)' : 'translateX(2px)' }} />
        </button>
      </div>

      {cfg.enabled && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Frequency</label>
            <select
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              data-testid={`${dataTestPrefix}-preset-${idx}`}
            >
              {PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Max Reminders (optional)</label>
            <input
              type="number"
              min={1}
              max={50}
              value={cfg.max_count ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setField({ max_count: v === '' ? null : Math.max(1, parseInt(v, 10)) });
              }}
              placeholder="Unlimited"
              className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
              data-testid={`${dataTestPrefix}-max-${idx}`}
            />
          </div>

          {presetId === 'custom' && (
            <div className="sm:col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Every</label>
                <input
                  type="number"
                  min={1}
                  max={9999}
                  value={cfg.interval_value || 1}
                  onChange={(e) => setField({ frequency_type: 'custom', interval_value: Math.max(1, parseInt(e.target.value || '1', 10)) })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  data-testid={`${dataTestPrefix}-interval-value-${idx}`}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Unit</label>
                <select
                  value={cfg.interval_unit || 'days'}
                  onChange={(e) => setField({ frequency_type: 'custom', interval_unit: e.target.value })}
                  className="w-full px-2 py-1.5 text-xs border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                  data-testid={`${dataTestPrefix}-interval-unit-${idx}`}
                >
                  {UNIT_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
