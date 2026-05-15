import { randomUUID } from "crypto";

export class PayCoreNotConfiguredError extends Error {}
export class PayCoreRequestError extends Error {}

export async function createPaymentInvoice(
  settings,
  { amount, currency, description, referenceId },
) {
  if (settings.paycoreMode.toLowerCase() === "demo") {
    const ref = referenceId || randomUUID();
    return {
      id: `demo-${ref}`,
      hpp_url: `https://paycore.example/checkout/${ref}`,
      reference_id: ref,
    };
  }

  if (!settings.paycorePublicKey || !settings.paycoreApiBaseUrl) {
    throw new PayCoreNotConfiguredError(
      "Задайте PAYCORE_PUBLIC_KEY и PAYCORE_API_BASE_URL",
    );
  }
  if (!settings.paycorePaymentService) {
    throw new PayCoreNotConfiguredError("Задайте PAYCORE_PAYMENT_SERVICE");
  }

  const ref = referenceId || randomUUID();
  const url = `${settings.paycoreApiBaseUrl.replace(/\/$/, "")}/public-api/payment-invoices`;
  const payload = {
    public_key: settings.paycorePublicKey,
    reference_id: ref,
    description: description.slice(0, 512),
    service: settings.paycorePaymentService,
    currency,
    amount: Number(amount),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok) {
    throw new PayCoreRequestError(`PayCore HTTP ${res.status}: ${text.slice(0, 2000)}`);
  }
  const data = body.data;
  if (!data || typeof data !== "object") {
    throw new PayCoreRequestError(`Неожиданный ответ PayCore: ${JSON.stringify(body)}`);
  }
  return data;
}
