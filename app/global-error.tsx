"use client";

import { useEffect, useState } from "react";
import { reportClientError } from "./_lib/client-error-report";

// Last-resort boundary: it replaces the root layout entirely, so no providers
// (i18n, theme, fonts, Tailwind styles) are available here. Copy is inlined
// for every supported language and styling is plain CSS on purpose.
const COPY: Record<string, { title: string; body: string; retry: string; home: string }> = {
  en: {
    title: "Something went wrong",
    body: "An unexpected error stopped the app. Your data is safe — try again, or head back home.",
    retry: "Try again",
    home: "Back to home",
  },
  es: {
    title: "Algo salió mal",
    body: "Un error inesperado detuvo la aplicación. Tus datos están a salvo: inténtalo de nuevo o vuelve al inicio.",
    retry: "Intentar de nuevo",
    home: "Volver al inicio",
  },
  pt: {
    title: "Algo deu errado",
    body: "Um erro inesperado interrompeu o aplicativo. Seus dados estão seguros — tente novamente ou volte ao início.",
    retry: "Tentar novamente",
    home: "Voltar ao início",
  },
  sw: {
    title: "Hitilafu imetokea",
    body: "Hitilafu isiyotarajiwa ilisimamisha programu. Data yako iko salama — jaribu tena au rudi mwanzo.",
    retry: "Jaribu tena",
    home: "Rudi mwanzo",
  },
  id: {
    title: "Terjadi kesalahan",
    body: "Kesalahan tak terduga menghentikan aplikasi. Data Anda aman — coba lagi atau kembali ke beranda.",
    retry: "Coba lagi",
    home: "Kembali ke beranda",
  },
};

function resolveCopy(): (typeof COPY)[string] {
  if (typeof navigator !== "undefined") {
    const base = navigator.language?.split("-")[0]?.toLowerCase();
    if (base && COPY[base]) return COPY[base];
  }
  return COPY.en;
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [copy, setCopy] = useState(COPY.en);

  useEffect(() => {
    // Resolve language on the client only, so server and first client render match.
    setCopy(resolveCopy());
    reportClientError(error, `global-error${error.digest ? `:${error.digest}` : ""}`);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4efe4",
          color: "#141413",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "26rem" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.75rem" }}>{copy.title}</h1>
          <p style={{ fontSize: "0.9rem", lineHeight: 1.6, opacity: 0.75, marginBottom: "1.5rem" }}>{copy.body}</p>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "0.55rem 1.2rem",
                borderRadius: "9999px",
                border: "none",
                background: "#1a7f4f",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              {copy.retry}
            </button>
            <a
              href="/"
              style={{
                padding: "0.55rem 1.2rem",
                borderRadius: "9999px",
                border: "1px solid rgba(20, 20, 19, 0.25)",
                background: "transparent",
                color: "inherit",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              {copy.home}
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
