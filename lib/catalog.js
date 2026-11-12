/**
 * Canonical NaN provider profile written by /nan-setup.
 *
 * Mirrors the catalog the profile ships (api.nan.builders, OpenAI-compatible):
 * model ids, context windows, efforts and wire compat. Kept as a plain JS
 * module so the setup path has no YAML/build dependency.
 */

export const NAN_PROVIDER_ID = 'nan'
export const NAN_DISPLAY_NAME = 'NaN'
export const NAN_API = "openai-completions"
export const NAN_BASE_URL = "https://api.nan.builders/v1"
export const NAN_API_KEY_ENV = "OPENAI_API_KEY"

export const NAN_MODELS = [
  {
    "id": "deepseek-v4-flash",
    "name": "DeepSeek V4.1 Flash",
    "contextWindow": 1048576,
    "maxTokens": 32768,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "deepseek-v4-pro",
    "name": "DeepSeek V4-Pro (0813 version)",
    "contextWindow": 1048576,
    "maxTokens": 32768,
    "input": [
      "text"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "gemma4",
    "name": "Gemma 4 26B A4B IT",
    "contextWindow": 262144,
    "maxTokens": 32768,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "minimal": "minimal",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "glm5.3",
    "name": "GLM 5.3",
    "contextWindow": 1048576,
    "maxTokens": 131072,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "glm5.3-flash",
    "name": "GLM-5.3-Flash",
    "contextWindow": 1048576,
    "maxTokens": 131072,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "minimal": "minimal",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "hy4",
    "name": "Hy4",
    "contextWindow": 1048576,
    "maxTokens": 32768,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "kimi-k3.1-pro",
    "name": "Kimi K3.1 Pro",
    "contextWindow": 1048576,
    "maxTokens": 32768,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "mimo-v2.6-flash",
    "name": "MiMo-V2.6-Flash",
    "contextWindow": 1048576,
    "maxTokens": 131072,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "qwen3.6",
    "name": "Qwen3.6 35B-A3B",
    "contextWindow": 262144,
    "maxTokens": 65536,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "minimal": "minimal",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  },
  {
    "id": "qwen3.8-flash",
    "name": "Qwen3.8 Flash",
    "contextWindow": 1048576,
    "maxTokens": 131072,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_completion_tokens"
    }
  },
  {
    "id": "qwen3.8-max",
    "name": "Qwen3.8 Max",
    "contextWindow": 1000000,
    "maxTokens": 32768,
    "input": [
      "text",
      "image"
    ],
    "reasoningEfforts": {
      "off": "none",
      "low": "low",
      "medium": "medium",
      "high": "high",
      "max": "max"
    },
    "compat": {
      "supportsDeveloperRole": false,
      "supportsReasoningEffort": true,
      "supportsUsageInStreaming": true,
      "supportsFinishReason": true,
      "maxTokensField": "max_tokens"
    }
  }
]

export const NAN_COMPAT = undefined

export const NAN_RETRY_POLICY = {
  "mode": "normal",
  "maxRetries": 5,
  "retryableCodes": [
    "EMPTY_RESPONSE",
    "RATE_LIMIT",
    "SERVER",
    "TIMEOUT",
    "TRANSPORT",
    "STREAM_CLOSED"
  ]
}
