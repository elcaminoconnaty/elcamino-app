/** Configuración del asistente, separada de `agente.ts` para que las páginas puedan
 *  preguntar si está listo sin cargar el SDK. */
export const MODELO = process.env.ASISTENTE_MODELO || "sonnet";

/** Solo en desarrollo: `ASISTENTE_LOGIN_LOCAL=1 npm run dev` usa el login de Claude Code del
 *  computador en vez del token de Naty, para probar sin tenerlo. En producción no existe. */
export const LOGIN_LOCAL = process.env.NODE_ENV !== "production" && process.env.ASISTENTE_LOGIN_LOCAL === "1";

export function problemaDeConfiguracion(): string | null {
  if (!process.env.CLAUDE_CODE_OAUTH_TOKEN && !LOGIN_LOCAL) {
    return "Falta conectar la suscripción de Claude de Naty (CLAUDE_CODE_OAUTH_TOKEN). Se saca una vez con `claude setup-token` en su computador y se guarda en Railway.";
  }
  return null;
}
