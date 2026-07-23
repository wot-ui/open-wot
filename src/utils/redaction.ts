const SENSITIVE_KEY = String.raw`(?:api[_-]?key|access[_-]?token|auth(?:orization)?|bearer|client[_-]?secret|password|passwd|secret|token|cookie)`
const BEARER_PATTERN = /(authorization\s*:\s*bearer\s+)[^\s,;]+/gi
const ASSIGNMENT_PATTERN = new RegExp(`(["']?${SENSITIVE_KEY}["']?\\s*[:=]\\s*)(?:"[^"]*"|'[^']*'|\\S+)`, 'gi')

export function redactSensitiveText(value: string, secretValues: string[] = []): string {
  let redacted = value.replace(BEARER_PATTERN, '$1[REDACTED]')
  redacted = redacted.replace(ASSIGNMENT_PATTERN, '$1[REDACTED]')
  for (const secret of secretValues) {
    if (secret)
      redacted = redacted.split(secret).join('[REDACTED]')
  }
  return redacted
}
