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
/**
 * Numbers aligned with NaN's own CLI (`internal/models/models.go`, measured
 * against the proxy 2026-09-11), which is the vendor's authoritative table:
 * 32,768 output on every 1M model, deepseek's 1,048,575 window, glm5.3
 * text-only and gemma4's 65,536 output.
 */
const NAN_CLI_ALIGNMENT = {
  'deepseek-v4-flash': { contextWindow: 1_048_575, maxTokens: 32_768 },
  'glm5.3-flash': { maxTokens: 32_768 },
  'qwen3.8-flash': { maxTokens: 32_768 },
  'mimo-v2.6-flash': { maxTokens: 32_768 },  // audio is served but pi's modality set is text|image only
  gemma4: { maxTokens: 65_536 },
  'qwen3.6': { maxTokens: 65_536 },
  'glm5.3': { maxTokens: 32_768, input: ['text'] },
}

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
    const aligned = NAN_CLI_ALIGNMENT[model.id]
    const override = { ...(aligned ?? {}), ...(OVERRIDES[model.id] ?? {}) }
    if (Object.keys(override).length === 0) return model
    const next = { ...model, ...override }
    if (override.reasoningEfforts === null) delete next.reasoningEfforts
    return next
  })
}
