/**
 * Manual corrections over the shipped NaN catalog.
 *
 * Ported from `pi-nan-provider/scripts/manual-overrides.ts` — MIT,
 * Copyright (c) 2026 gtrabanco (see NOTICE) — where the values were measured
 * against the live gateway (issues #16, #20, #34). They are provenance notes
 * for maintainers; nothing here is invented:
 *
 * - glm5.3: shallowest documented effort is `low`, so `off` sends `low`; the
 *   docs do not list `minimal` for this model.
 * - glm5.3-flash: `none` does NOT stop reasoning (13k reasoning tokens
 *   measured); `minimal` does, so `off` sends `minimal`.
 * - deepseek-v4-flash: a reasoning model. `none` turns thinking off; the
 *   documented ladder (minimal…max) is accepted, though the gateway may treat
 *   the depth as a hint. Declared in full so the UI treats it as reasoning and
 *   `off` sends `none` — it is NOT a non-reasoning model.
 * - kimi-k3.1-pro, qwen3.8-max, deepseek-v4-pro, hy4: reasoning models whose
 *   effort translation is unmeasured; the shipped ladders are kept rather than
 *   claiming `false` (which would say "does not reason at all").
 * - qwen3.8-flash: `max_tokens` does not bound the reasoning phase on this
 *   model; `max_completion_tokens` does (maintainer-confirmed, issue #34).
 *   The shipped compat already reflects it; kept here as a pin.
 */
const OVERRIDES = {
  'glm5.3': {
    reasoningEfforts: { off: 'low', low: 'low', medium: 'medium', high: 'high', max: 'max' },
  },
  'glm5.3-flash': {
    reasoningEfforts: { off: 'minimal', minimal: 'minimal', low: 'low', medium: 'medium', high: 'high', max: 'max' },
  },
  'mimo-v2.6-flash': {
    reasoningEfforts: { off: 'none', low: 'low', medium: 'medium', high: 'high', max: 'max' },
  },
  'qwen3.8-flash': {
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: true, supportsUsageInStreaming: true, supportsFinishReason: true, maxTokensField: 'max_completion_tokens' },
  },
}

/** Apply the overrides to a model list. */
export function applyModelOverrides(models) {
  return models.map(model => {
    const override = OVERRIDES[model.id]
    if (override === undefined) return model
    const next = { ...model, ...override }
    if (override.reasoningEfforts === null) delete next.reasoningEfforts
    return next
  })
}
