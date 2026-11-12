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
 * - deepseek-v4-flash: only `none` reliably disables reasoning (0 tokens);
 *   every other value leaves 13–14k reasoning tokens and can end the answer
 *   with `finish_reason: length` and no text. Expose only `off`.
 * - kimi-k3.1-pro, qwen3.8-max, deepseek-v4-pro, hy4: the gateway's
 *   `reasoning_effort` translation for these external providers is unmeasured,
 *   so they declare no adjustable effort (the model keeps its default).
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
  // DSH requires at least one level beyond `off` (or `false` for a model with
  // no adjustable effort). Only `none` is safe here, so the honest form is
  // "not adjustable": the model keeps its own (short) default reasoning.
  'deepseek-v4-flash': {
    reasoningEfforts: false,
  },
  'mimo-v2.6-flash': {
    reasoningEfforts: { off: 'none', low: 'low', medium: 'medium', high: 'high', max: 'max' },
  },
  'kimi-k3.1-pro': { reasoningEfforts: false },
  'qwen3.8-max': { reasoningEfforts: false },
  'deepseek-v4-pro': { reasoningEfforts: false },
  hy4: { reasoningEfforts: false },
  'qwen3.8-flash': {
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: true, supportsUsageInStreaming: true, supportsFinishReason: true, maxTokensField: 'max_completion_tokens' },
  },
}

/**
 * Apply the overrides to a model list. `reasoningEfforts: false` marks the
 * model as having no adjustable effort (the DSH schema's own form).
 */
export function applyModelOverrides(models) {
  return models.map(model => {
    const override = OVERRIDES[model.id]
    if (override === undefined) return model
    const next = { ...model, ...override }
    if (override.reasoningEfforts === null) delete next.reasoningEfforts
    return next
  })
}
