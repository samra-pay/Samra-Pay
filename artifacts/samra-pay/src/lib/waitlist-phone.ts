export type PhoneCountry = "US" | "ET" | "international";

// Formatting validation only: a captured number is not verified or SMS consent.
export function normalizeWaitlistPhone(
  value: string,
  country: PhoneCountry,
): string | null {
  if (!value.trim()) return "";
  if (value.length > 32 || !/^\+?[0-9\s().-]+$/.test(value.trim())) return null;
  let phone = value.trim().replace(/[\s().-]/g, "");
  if (!phone.startsWith("+")) {
    if (country === "US") phone = `+1${phone}`;
    else if (country === "ET") phone = `+251${phone.replace(/^0/, "")}`;
    else return null;
  }
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone)) return null;
  if (country === "US" && !/^\+1[2-9][0-9]{2}[2-9][0-9]{6}$/.test(phone))
    return null;
  if (country === "ET" && !/^\+251[1-9][0-9]{8}$/.test(phone)) return null;
  return phone;
}
