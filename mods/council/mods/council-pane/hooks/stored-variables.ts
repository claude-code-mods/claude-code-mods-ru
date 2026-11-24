// ABOUTME: The plugin config options the mod sets as environment variables, and the variable each one becomes
// ABOUTME: Option names match plugin.json's userConfig; a missing, blank or mistyped value sets nothing

export const STORED_VARIABLES = [
  { option: 'gemini_api_key', variable: 'GEMINI_API_KEY', title: 'Ключ Gemini API', sensitive: true },
  { option: 'openai_api_key', variable: 'OPENAI_API_KEY', title: 'Ключ OpenAI API', sensitive: true },
  { option: 'xai_api_key', variable: 'XAI_API_KEY', title: 'Ключ xAI API (Grok)', sensitive: true },
  { option: 'perplexity_api_key', variable: 'PERPLEXITY_API_KEY', title: 'Ключ Perplexity API', sensitive: true },
  { option: 'kimi_api_key', variable: 'KIMI_API_KEY', title: 'Ключ Kimi API', sensitive: true },
  { option: 'openrouter_api_key', variable: 'OPENROUTER_API_KEY', title: 'Ключ OpenRouter API', sensitive: true },
  { option: 'openrouter_models', variable: 'OPENROUTER_MODELS', title: 'Модели OpenRouter', sensitive: false },
] as const

export type StoredVariable = (typeof STORED_VARIABLES)[number]['variable']

export type StoredValue = { variable: StoredVariable; value: string }

export function storedValues(options: Record<string, unknown>): StoredValue[] {
  return STORED_VARIABLES.flatMap(({ option, variable }) => {
    const value = typeof options[option] === 'string' ? options[option].trim() : ''
    return value !== '' ? [{ variable, value }] : []
  })
}
