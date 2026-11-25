/** @param {{pagePath: string, requestPath: string, requestMethod: string, status?: number, relatedTraceId?: string, error?: unknown}} input */
export function requestFailurePayload({ pagePath, requestPath, requestMethod, status = undefined, relatedTraceId = undefined, error = undefined }) {
  return { type: 'request_failure', pagePath, requestPath, requestMethod, ...(Number.isInteger(status) ? { status } : {}), ...(relatedTraceId ? { relatedTraceId } : {}), ...(error ? { code: 'NETWORK_FAILURE', message: error instanceof Error ? error.message : String(error) } : {}) };
}
