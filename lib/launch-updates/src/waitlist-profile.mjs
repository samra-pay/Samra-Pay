// Optional profile capture for NEW contacts only. No identity/phone verification.
export function normalizeWaitlistProfile({ firstName, phoneNumber } = {}) {
  const result = {};
  if (firstName !== undefined) {
    if (
      typeof firstName !== "string" ||
      firstName.length > 100 ||
      /[\p{Cc}\p{Cf}]/u.test(firstName)
    ) {
      throw new Error("INVALID_PROFILE");
    }
    const name = firstName.trim().normalize("NFC");
    if (name) result.firstName = name;
  }
  if (phoneNumber !== undefined) {
    if (typeof phoneNumber !== "string" || phoneNumber.length > 32) {
      throw new Error("INVALID_PROFILE");
    }
    const phone = phoneNumber.trim();
    // The browser supplies international format; no ambiguous country inference.
    if (phone && !/^\+[1-9][0-9]{7,14}$/u.test(phone)) {
      throw new Error("INVALID_PROFILE");
    }
    if (phone) result.phoneNumber = phone;
  }
  return Object.freeze(result);
}
