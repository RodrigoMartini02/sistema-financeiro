import {
  fetchClassificacoesReceita,
  saveClassificacaoReceita,
  saveClassificacaoReceitaFixa,
  toggleClassificacaoReceita,
} from '../../services/incomeClassificationsService';
import { getActiveAccountId } from '../../services/apiClient';
import { queryKeys } from '../../services/queryKeys';
import type { ClassificacaoReceita } from '../../types/config';
import { C, labelStyle, fieldInputStyle, MoneyField } from '../../ui/dialogFormTokens';
import { cfgBadgeStyle } from '../../ui/configTokens';
import { ToggleRow } from '../../ui/form';
import { formatCurrency } from '../finance/formatters';
import { CatalogoEmArvore, type ExtensaoCatalogo, type TextosCatalogo } from './CatalogoEmArvore';

const DESTAQUE_RECEITA = '#059669'; // classificações representam receitas

const TEXTOS: TextosCatalogo = {
  singular: 'classificação',
  plural: 'classificações',
  exemploNome: 'Ex: Salário',
  descricaoVazio: 'Crie classificações para organizar receitas e relatórios.',
  ondeSomeAoDesativar: 'nas opções de classificação ao lançar receitas',
  tituloPadrao: 'Classificação padrão do sistema',
};

const DIA_PADRAO = 5;
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Estado dos campos de fixa no modal (a configuração vale para a conta ativa). */
interface CamposFixa {
  fixa: boolean;
  valor: number | undefined;
  dia: number;
  automatico: boolean;
}

const EXTENSAO: ExtensaoCatalogo<ClassificacaoReceita, CamposFixa> = {
  estadoInicial: (item) => (item?.fixa
    ? { fixa: true, valor: item.fixa.valor, dia: item.fixa.dia_recebimento, automatico: item.fixa.lancar_automatico }
    : { fixa: false, valor: undefined, dia: DIA_PADRAO, automatico: false }),

  campos: ({ item, valor, alterar }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <ToggleRow
        label="Receita fixa"
        description="Valor e dia em que costuma entrar: preenchem o lançamento da receita."
        checked={valor.fixa}
        onChange={() => alterar({ ...valor, fixa: !valor.fixa })}
      />
      {valor.fixa && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px', gap: 10 }}>
            <div>
              <label style={labelStyle}><span>Valor</span><span style={{ color: C.danger }}>*</span></label>
              <MoneyField value={valor.valor} onChange={(v) => alterar({ ...valor, valor: v })} />
            </div>
            <div>
              <label style={labelStyle}>Dia do recebimento</label>
              <select
                value={valor.dia}
                onChange={(e) => alterar({ ...valor, dia: Number(e.target.value) })}
                style={fieldInputStyle}
              >
                {DIAS.map((dia) => <option key={dia} value={dia}>{dia}</option>)}
              </select>
            </div>
          </div>
          {item?.em_contrato_ativo ? (
            <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
              Usada por um contrato ativo: o próprio contrato já lança essas receitas, então o lançamento automático fica desligado.
            </p>
          ) : (
            <ToggleRow
              label="Lançar automaticamente todo mês?"
              description="No dia do recebimento, a receita do mês entra como prevista e você recebe um aviso para confirmar."
              checked={valor.automatico}
              onChange={() => alterar({ ...valor, automatico: !valor.automatico })}
            />
          )}
        </>
      )}
    </div>
  ),

  selo: (item) => item.fixa && (
    <span style={cfgBadgeStyle} title="Classificação fixa nesta conta">
      Fixa · {formatCurrency(item.fixa.valor)} · dia {item.fixa.dia_recebimento}
      {item.fixa.lancar_automatico ? ' · automático' : ''}
    </span>
  ),
};

export function ClassificacoesReceitaTab() {
  const accountId = getActiveAccountId();

  // Nome e fixa são gravados em chamadas separadas; a fixa é validada antes
  // para não salvar o nome e falhar no valor.
  const salvar = async (
    values: Parameters<typeof saveClassificacaoReceita>[0],
    id?: number,
    campos?: CamposFixa,
  ) => {
    if (campos?.fixa && !(campos.valor && campos.valor > 0)) {
      throw new Error('Informe o valor da receita fixa.');
    }
    const salva = await saveClassificacaoReceita(values, id, accountId);
    if (!campos) return salva;
    if (campos.fixa) {
      return saveClassificacaoReceitaFixa(salva.id, {
        valor: campos.valor!,
        dia_recebimento: campos.dia,
        lancar_automatico: campos.automatico,
      }, accountId);
    }
    // Desligar só faz sentido em quem já existia.
    return id ? saveClassificacaoReceitaFixa(salva.id, null, accountId) : salva;
  };

  return (
    <CatalogoEmArvore
      queryKey={queryKeys.classificacoesReceita(accountId)}
      invalidarPrefixo={['classificacoes-receita']}
      carregar={() => fetchClassificacoesReceita(accountId)}
      salvar={salvar}
      alternar={(id) => toggleClassificacaoReceita(id, accountId)}
      destaque={DESTAQUE_RECEITA}
      textos={TEXTOS}
      extensao={EXTENSAO}
    />
  );
}
