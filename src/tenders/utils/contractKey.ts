// A chave do contrato no app (plano .plans/licitacoes-contratos-no-r2.md): o
// número de controle do PNCP ("03353358000196-2-000216/2026") ou, nos contratos
// federais, "comprasgov-<id>". Ela identifica o contrato nas rotas, no painel
// lateral (?contrato=), nos favoritos e nas notificações. Tem barra, então vai
// codificada nos caminhos (a barra vira %2F). A API confere o mesmo formato.

const CONTRACT_KEY = /^(?:\d{14}-\d-\d{6,10}\/\d{4}|comprasgov-\d{1,12})$/;

export function isContractKey(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length <= 60 && CONTRACT_KEY.test(value);
}

/** Caminho do contrato no app, relativo à base (/contratos/<chave codificada>). */
export function contractPath(key: string): string {
  return `/contratos/${encodeURIComponent(key)}`;
}

/** Valor de um parâmetro de rota ou da URL como chave; fora do formato (ou ilegível), null. */
export function contractKeyFromParam(value: string | null | undefined): string | null {
  if (!value) return null;
  let decoded = value;
  try {
    // O roteador já devolve o parâmetro decodificado; uma chave ainda com %2F (link colado) é decodificada aqui.
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  return isContractKey(decoded) ? decoded : null;
}
