const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'

const PHONE_RE = /^(?:\+98|0)?9\d{9}$|^0\d{10}$/

/**
 * Normalizes a phone input for validation: Persian/Arabic digits become
 * ASCII and spaces/dashes are dropped, so users on either keyboard pass.
 */
export function normalizePhone(input: string): string {
  return input
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)))
    .replace(/[\s-]/g, '')
}

export function isValidPhone(input: string): boolean {
  return PHONE_RE.test(normalizePhone(input))
}
