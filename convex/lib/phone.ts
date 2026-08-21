/** Normalize to E.164-ish for India-first UX. Stores digits with leading +. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = `+${digits.slice(2)}`;
  if (digits.startsWith("+")) {
    const rest = digits.slice(1).replace(/\D/g, "");
    if (rest.length < 10 || rest.length > 15) return null;
    return `+${rest}`;
  }

  const only = digits.replace(/\D/g, "");
  if (only.length === 10) return `+91${only}`;
  if (only.length === 12 && only.startsWith("91")) return `+${only}`;
  if (only.length >= 10 && only.length <= 15) return `+${only}`;
  return null;
}

export function maskPhone(phone: string): string {
  if (phone.length < 6) return phone;
  return `${phone.slice(0, 3)}••••${phone.slice(-3)}`;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
