import { useQueryClient } from '@tanstack/react-query';
import {
  fetchClassificacoesReceita,
  saveClassificacaoReceita,
  saveClassificacaoReceitaFixa,
  toggleClassificacaoReceita,
} from '../../services/incomeClassificationsService';
import { getActiveAccountId } from '../../services/apiClient';
import { invalidateIncomeQueries, queryKeys } from '../../services/queryKeys';
import type { ClassificacaoReceita } from '../../types/config';
import { C, labelStyle, fieldInputStyle, MoneyField } from '../../ui/dialogFormTokens';
import { cfgBadgeStyle } from '../../ui/configTokens';
import { ToggleRow } from '../../ui/form';
import { formatCurrency } from '../finance/formatters';
import { CatalogoEmArvore, type ExtensaoCatalogo, type TextosCatalogo } from './CatalogoEmArvore';

const DESTAQUE_RECEITA = '#059669'; // classificações representam receitas

const TEXTOS: TextosCatalogo = {
  singular: 'categoria',
  plural: 'categorias',
  exemploNome: 'Ex: Salário',
  descricaoVazio: 'Crie categorias para organizar receitas e relatórios.',
  ondeSomeAoDesativar: 'nas opções de categoria ao lançar receitas',
  tituloPadrao: 'Categoria padrão do sistema',
};

const DIA_PADRAO = 5;
const DIAS = Array.from({ length: 31 }, (_, i) => i + 1);

/** Campos da receita fixa no modal: valem para quem está logado, na conta ativa. */
interface CamposFixa {
  fixa: boolean;
  valor: number | undefined;
  dia: number;
}

const EXTENSAO: ExtensaoCatalogo<ClassificacaoReceita, CamposFixa> = {
  // Classificação com subclassificações é só o nome do grupo, e a usada por
  // contrato ativo já tem as receitas lançadas pelo contrato: nenhuma das duas
  // é fixa (salvar desliga uma fixa antiga, se houver).
  estadoInicial: (item, temSubcategorias) => (item?.fixa && !temSubcategorias && !item.em_contrato_ativo
    ? { fixa: true, valor: item.fixa.valor, dia: item.fixa.dia_recebimento }
    : { fixa: false, valor: undefined, dia: DIA_PADRAO }),

  campos: ({ item, valor, alterar, temSubcategorias }) => {
    if (temSubcategorias) {
      return (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
          Esta categoria tem subcategorias, então funciona só como nome do grupo. Para uma receita fixa, marque a
          subcategoria (ex.: Salário, dentro de Emprego).
        </p>
      );
    }
    if (item?.em_contrato_ativo) {
      return (
        <p style={{ margin: 0, fontSize: 11.5, color: C.textMuted }}>
          Usada por um contrato ativo: o próprio contrato já lança essas receitas, então ela não pode ser fixa.
        </p>
      );
    }
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <ToggleRow
          label="Receita fixa"
          description="Só sua: valor e dia em que costuma entrar. O ano fica registrado como previsto, e o valor preenche o lançamento."
          checked={valor.fixa}
          onChange={() => alterar({ ...valor, fixa: !valor.fixa })}
        />
        {valor.fixa && (
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
        )}
      </div>
    );
  },

  selo: (item) => item.fixa && (
    <span style={cfgBadgeStyle} title="Sua receita fixa nesta conta">
      Fixa · {formatCurrency(item.fixa.valor)} · dia {item.fixa.dia_recebimento}
    </span>
  ),
};

export function ClassificacoesReceitaTab() {
  const accountId = getActiveAccountId();
  const qc = useQueryClient();

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
    // Desligar só faz sentido em quem já existia.
    if (!campos.fixa && !id) return salva;
    const comFixa = await saveClassificacaoReceitaFixa(
      salva.id,
      campos.fixa ? { valor: campos.valor!, dia_recebimento: campos.dia } : null,
      accountId,
    );
    // As previstas do ano podem ter mudado: lista, Painel e renovação refazem.
    invalidateIncomeQueries(qc);
    return comFixa;
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
