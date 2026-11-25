/**
 * NuraWell entry point for the shared OpenRouter request builder.
 * All OpenRouter inference paths must use these helpers or a wrapper
 * that already does (meteredFetch, groqCompatFetch, createAiProvider, the SDK clients).
 */
export {
  OPENROUTER_GMI_CLOUD_SLUG,
  OPENROUTER_IGNORED_PROVIDERS,
  isOpenRouterApiUrl,
  isOpenRouterInferenceUrl,
  mergeOpenRouterProviderPrefs,
  applyOpenRouterProviderIgnore,
  applyOpenRouterProviderIgnoreToPayload,
  applyOpenRouterProviderIgnoreToBodyString,
  applyOpenRouterProviderIgnoreToInit,
  readOpenRouterProvider,
} from '../../../../packages/@platform/ai-engine/src/openrouter-request';
