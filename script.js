/* eslint-disable no-alert */
const STORAGE_KEY = "astro_n8n_webhook_url_v1";

function $(id) {
  return document.getElementById(id);
}

function setStatus(type, message) {
  const el = $("status");
  el.classList.remove("ok", "bad");
  if (type === "ok") el.classList.add("ok");
  if (type === "bad") el.classList.add("bad");
  el.textContent = message || "";
}

function setFieldError(fieldId, message) {
  const err = $(`err-${fieldId}`);
  if (err) err.textContent = message || "";
}

function clearErrors() {
  [
    "fullName",
    "email",
    "dob",
    "tob",
    "pob",
    "gender",
    "focus",
    "notes",
    "webhookUrl",
  ].forEach((k) => setFieldError(k, ""));
}

function isValidEmail(email) {
  // Simple, pragmatic email check (HTML input also validates).
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || "").trim());
}

function normalizeString(s) {
  return String(s || "").trim().replace(/\s+/g, " ");
}

function readForm() {
  return {
    fullName: normalizeString($("fullName").value),
    email: normalizeString($("email").value),
    dob: $("dob").value,
    tob: $("tob").value || null,
    pob: normalizeString($("pob").value),
    gender: $("gender").value || null,
    focus: $("focus").value,
    notes: normalizeString($("notes").value) || null,
    submittedAt: new Date().toISOString(),
    // Helpful metadata for workflow debugging
    client: {
      userAgent: navigator.userAgent,
      language: navigator.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
    },
  };
}

function validate(data, webhookUrl) {
  clearErrors();
  const errors = {};

  if (!data.fullName || data.fullName.length < 2) {
    errors.fullName = "Please enter your full name.";
  }

  if (!data.email || !isValidEmail(data.email)) {
    errors.email = "Please enter a valid email address.";
  }

  if (!data.dob) {
    errors.dob = "Please select your date of birth.";
  } else {
    const dobDate = new Date(`${data.dob}T00:00:00`);
    const now = new Date();
    if (Number.isNaN(dobDate.getTime())) {
      errors.dob = "Please enter a valid date.";
    } else if (dobDate > now) {
      errors.dob = "Date of birth cannot be in the future.";
    } else {
      const ageYears = (now - dobDate) / (365.25 * 24 * 60 * 60 * 1000);
      if (ageYears > 120) errors.dob = "Please double-check the year (age looks too high).";
    }
  }

  if (!data.pob || data.pob.length < 2) {
    errors.pob = "Please enter your place of birth (e.g., City, Country).";
  }

  if (!data.focus) {
    errors.focus = "Please choose an area of focus.";
  }

  if (!webhookUrl) {
    errors.webhookUrl = "Please provide your n8n Webhook URL in Advanced settings.";
  } else {
    let url;
    try {
      url = new URL(webhookUrl);
      if (!/^https?:$/.test(url.protocol)) throw new Error("Bad protocol");
    } catch {
      errors.webhookUrl = "https://coderbagya.app.n8n.cloud/webhook-test/Astro";
    }
  }

  Object.entries(errors).forEach(([k, v]) => setFieldError(k, v));
  return { ok: Object.keys(errors).length === 0, errors };
}

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  // n8n can respond with JSON or text based on config
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      text ||
      `Request failed with status ${res.status}`;
    throw new Error(msg);
  }

  return data ?? { ok: true };
}

function setSubmitting(isSubmitting) {
  const btn = $("submitBtn");
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? "Sending…" : "Generate & email my prediction";
}

function init() {
  $("year").textContent = String(new Date().getFullYear());

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) $("webhookUrl").value = saved;

  $("webhookUrl").addEventListener("change", () => {
    const v = $("webhookUrl").value.trim();
    if (v) localStorage.setItem(STORAGE_KEY, v);
  });

  $("resetBtn").addEventListener("click", () => {
    $("astroForm").reset();
    clearErrors();
    setStatus("", "Form reset.");
    const saved2 = localStorage.getItem(STORAGE_KEY);
    if (saved2) $("webhookUrl").value = saved2;
  });

  $("astroForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    setStatus("", "");

    const webhookUrl = $("webhookUrl").value.trim();
    const payload = readForm();
    const result = validate(payload, webhookUrl);
    if (!result.ok) {
      setStatus("bad", "Please fix the highlighted fields and try again.");
      return;
    }

    // persist webhook if valid
    localStorage.setItem(STORAGE_KEY, webhookUrl);

    setSubmitting(true);
    setStatus("", "Submitting details to the workflow…");

    try {
      const response = await postJson(webhookUrl, payload);
      const workflowMessage =
        (response && (response.message || response.status)) ||
        "Submitted successfully. Please check your inbox (and spam folder) in a few minutes.";
      setStatus("ok", workflowMessage);
      // keep fields but clear notes
      $("notes").value = "";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setStatus(
        "bad",
        `Could not submit to the workflow. ${msg} (Tip: confirm your n8n Webhook URL and that CORS is enabled on n8n.)`
      );
    } finally {
      setSubmitting(false);
    }
  });
}

document.addEventListener("DOMContentLoaded", init);

