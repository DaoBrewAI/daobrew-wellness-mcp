function canonicalUserId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
    return null;
  }
  return trimmed.toUpperCase();
}

function normalizeApiUrl(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("DaoBrew API URL is missing");
  }
  const normalized = value.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("DaoBrew API URL is invalid");
  }
  if (parsed.username || parsed.password) {
    throw new Error("DaoBrew API URL must not contain embedded credentials");
  }
  const loopback = parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "[::1]"
    || parsed.hostname === "::1";
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback)) {
    throw new Error("DaoBrew API URL must use HTTPS (HTTP is allowed only for loopback development)");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("DaoBrew API URL must not contain a query string or fragment");
  }
  return normalized;
}

async function setupCliAnchorEnrollment(options) {
  const {
    apiUrl,
    existing,
    fetchImpl = fetch,
    installationNonce,
    platform,
    surface,
    userId,
    writeConfig,
  } = options;
  const normalizedApiUrl = normalizeApiUrl(apiUrl);
  const existingCredential = typeof existing.device_credential === "string"
    && existing.device_credential.startsWith("dbd_")
    && existing.device_credential_confirmed === true
    ? existing.device_credential
    : null;

  if (existingCredential) {
    const recovered = await fetchImpl(`${normalizedApiUrl}/device/confirm`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${existingCredential}`,
      },
      body: JSON.stringify({ installation_nonce: installationNonce }),
    });
    const recoveryPayload = await recovered.json().catch(() => ({}));
    if (recovered.ok) {
      const recoveredUserId = canonicalUserId(recoveryPayload?.data?.user_id);
      if (!recoveredUserId) {
        throw new Error("DaoBrew device confirmation did not return a canonical owner");
      }
      const recoveredDeviceId = canonicalUserId(recoveryPayload?.data?.device_id);
      writeConfig({
        ...existing,
        api_url: normalizedApiUrl,
        user_id: recoveredUserId,
        device_id: recoveredDeviceId || undefined,
        device_credential: existingCredential,
        device_credential_confirmed: true,
        installation_nonce: installationNonce,
      });
      return;
    }
    if (recovered.status !== 401 && recovered.status !== 403) {
      throw new Error(`DaoBrew device confirmation failed with HTTP ${recovered.status}`);
    }
  }

  const response = await fetchImpl(`${normalizedApiUrl}/device/register-anchor`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      installation_nonce: installationNonce,
      surface,
      platform,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.data?.device_credential) {
    throw new Error(`DaoBrew setup failed with HTTP ${response.status}`);
  }
  const credential = payload.data.device_credential;
  const confirmed = await fetchImpl(`${normalizedApiUrl}/device/confirm`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": `Bearer ${credential}`,
    },
    body: JSON.stringify({ installation_nonce: installationNonce }),
  });
  if (!confirmed.ok) {
    throw new Error(`DaoBrew device confirmation failed with HTTP ${confirmed.status}`);
  }
  const confirmationPayload = await confirmed.json().catch(() => ({}));
  const confirmedUserId = canonicalUserId(confirmationPayload?.data?.user_id);
  const registeredUserId = canonicalUserId(payload.data.user_id);
  const requestedUserId = canonicalUserId(userId);
  const confirmedDeviceId = canonicalUserId(confirmationPayload?.data?.device_id);
  const registeredDeviceId = canonicalUserId(payload.data.device_id);
  writeConfig({
    ...existing,
    api_url: payload.data.api_url || normalizedApiUrl,
    user_id: confirmedUserId || registeredUserId || requestedUserId,
    device_id: confirmedDeviceId || registeredDeviceId || undefined,
    device_credential: credential,
    device_credential_confirmed: true,
    installation_nonce: installationNonce,
  });
}

module.exports = {
  canonicalUserId,
  normalizeApiUrl,
  setupCliAnchorEnrollment,
};
