// Endereço pelo CEP no ViaCEP (público e gratuito). Só adianta o preenchimento:
// o cliente confere e completa os campos, e o servidor valida o endereço.

export interface CepAddress {
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
}

interface ViaCepResponse {
  erro?: boolean | string;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

/** Nulo quando o CEP não existe; erro de rede vira exceção. */
export async function fetchAddressByCep(cep: string): Promise<CepAddress | null> {
  const digits = cep.replace(/\D/g, '');
  if (digits.length !== 8) {
    return null;
  }
  const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
  if (!response.ok) {
    return null;
  }
  const data = (await response.json()) as ViaCepResponse;
  if (data.erro) {
    return null;
  }
  return {
    rua: data.logradouro ?? '',
    bairro: data.bairro ?? '',
    cidade: data.localidade ?? '',
    uf: data.uf ?? '',
  };
}
