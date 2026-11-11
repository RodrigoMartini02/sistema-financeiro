// Domínios do módulo de Licitações: valores do PNCP e dos campos com lista
// fechada nas tabelas do schema `licitacoes` (as CHECKs da migration 0073).

/** Modalidades de contratação do PNCP (`codigoModalidadeContratacao`). */
export const TENDER_MODALITIES = [
  { id: 1, name: 'Leilão – Eletrônico' },
  { id: 2, name: 'Diálogo Competitivo' },
  { id: 3, name: 'Concurso' },
  { id: 4, name: 'Concorrência – Eletrônica' },
  { id: 5, name: 'Concorrência – Presencial' },
  { id: 6, name: 'Pregão – Eletrônico' },
  { id: 7, name: 'Pregão – Presencial' },
  { id: 8, name: 'Dispensa de Licitação' },
  { id: 9, name: 'Inexigibilidade' },
  { id: 10, name: 'Manifestação de Interesse' },
  { id: 11, name: 'Pré-qualificação' },
  { id: 12, name: 'Credenciamento' },
  { id: 13, name: 'Leilão – Presencial' },
] as const;
export type TenderModalityId = (typeof TENDER_MODALITIES)[number]['id'];

export const TENDER_MODALITY_IDS: readonly number[] = TENDER_MODALITIES.map((modality) => modality.id);

/** Modalidades coletadas quando PNCP_MODALITIES não é informada. */
export const DEFAULT_COLLECTED_MODALITIES = [6, 8, 4, 7] as const;

/**
 * Situação da contratação no PNCP (`situacaoCompraId`). Só a 1 entra nas
 * buscas. Os nomes são os da tela (a 1 chega do PNCP como "Divulgada no PNCP").
 */
export const TENDER_SITUATIONS = [
  { id: 1, name: 'Divulgada' },
  { id: 2, name: 'Revogada' },
  { id: 3, name: 'Anulada' },
  { id: 4, name: 'Suspensa' },
] as const;

/**
 * Esfera do órgão no PNCP (`esferaId` do órgão; `esfera` dos editais e dos contratos): o `id` é o código gravado e o
 * `name`, o texto da tela. Os contratos federais do Compras.gov.br gravam `F`. Edital ou contrato sem esfera (ou com
 * outro código) só aparece sem o filtro.
 */
export const GOVERNMENT_SPHERES = [
  { id: 'F', name: 'Federal' },
  { id: 'E', name: 'Estadual' },
  { id: 'M', name: 'Municipal' },
  { id: 'D', name: 'Distrital' },
] as const;
export type GovernmentSphere = (typeof GOVERNMENT_SPHERES)[number]['id'];
export const GOVERNMENT_SPHERE_IDS: readonly string[] = GOVERNMENT_SPHERES.map((sphere) => sphere.id);

/** Códigos das situações do PNCP (`TENDER_SITUATIONS`), para validar o filtro da busca. */
export const TENDER_SITUATION_IDS: readonly number[] = TENDER_SITUATIONS.map((situation) => situation.id);

export const BRAZILIAN_STATES = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;
export type BrazilianState = (typeof BRAZILIAN_STATES)[number];

export const TRACKING_STATUSES = ['ANALISAR', 'PARTICIPAR', 'DESCARTADO'] as const;
export type TrackingStatus = (typeof TRACKING_STATUSES)[number];

/** Status gravado no histórico quando o acompanhamento é removido da conta. */
export const TRACKING_REMOVED = 'REMOVIDO';
export type TrackingHistoryStatus = TrackingStatus | typeof TRACKING_REMOVED;

/** Filtro de acompanhamento na busca: os status e "sem acompanhamento" (SEM). */
export const TRACKING_FILTER_NONE = 'SEM';
export const TRACKING_FILTERS = [...TRACKING_STATUSES, TRACKING_FILTER_NONE] as const;
export type TrackingFilter = (typeof TRACKING_FILTERS)[number];

export const SEARCH_TERMS_MODES = ['OU', 'E'] as const;
export type SearchTermsMode = (typeof SEARCH_TERMS_MODES)[number];

/** Ordenações da busca de editais; `relevance` só com termos. */
export const NOTICE_SORTS = ['closingAsc', 'publishedDesc', 'valueDesc', 'valueAsc', 'relevance'] as const;
export type NoticeSort = (typeof NOTICE_SORTS)[number];

/** Ordenações da busca de contratos; o padrão é o vencimento mais próximo, e `relevance` só vale com termos. */
export const CONTRACT_SORTS = ['expiryAsc', 'publishedDesc', 'valueDesc', 'valueAsc', 'relevance'] as const;
export type ContractSort = (typeof CONTRACT_SORTS)[number];

/** Categorias do processo nos contratos do PNCP (`categoriaProcesso`), com os nomes do PNCP: as 11 vistas no piloto de 14/10/2026. */
export const CONTRACT_CATEGORIES = [
  { id: 1, name: 'Cessão' },
  { id: 2, name: 'Compras' },
  { id: 3, name: 'Informática (TIC)' },
  { id: 4, name: 'Internacional' },
  { id: 5, name: 'Locação Imóveis' },
  { id: 6, name: 'Mão de Obra' },
  { id: 7, name: 'Obras' },
  { id: 8, name: 'Serviços' },
  { id: 9, name: 'Serviços de Engenharia' },
  { id: 10, name: 'Serviços de Saúde' },
  { id: 11, name: 'Alienação de bens móveis/imóveis' },
] as const;
export const CONTRACT_CATEGORY_IDS: readonly number[] = CONTRACT_CATEGORIES.map((category) => category.id);

/**
 * Setores e cargos que o titular escolhe para o colaborador (item 1A): listas padrão do módulo, sem edição pela
 * conta. O `id` é o código gravado em `conta_membros` (migration 0002); o `name` é o texto da tela. Mesmos nomes
 * com que as contas de Finanças começam. Cargos são de nível, sem área no nome: junto do setor formam o cargo
 * completo ("Gerente · Financeiro").
 */
export const MEMBER_SECTORS = [
  { id: 'administrativo', name: 'Administrativo' },
  { id: 'financeiro', name: 'Financeiro' },
  { id: 'comercial', name: 'Comercial' },
  { id: 'marketing', name: 'Marketing' },
  { id: 'recursos-humanos', name: 'Recursos Humanos' },
  { id: 'operacional', name: 'Operacional' },
  { id: 'atendimento', name: 'Atendimento' },
  { id: 'ti', name: 'TI' },
] as const;
export const MEMBER_SECTOR_IDS: readonly string[] = MEMBER_SECTORS.map((sector) => sector.id);

export const MEMBER_JOB_TITLES = [
  { id: 'diretor', name: 'Diretor' },
  { id: 'gerente', name: 'Gerente' },
  { id: 'coordenador', name: 'Coordenador' },
  { id: 'supervisor', name: 'Supervisor' },
  { id: 'analista', name: 'Analista' },
  { id: 'assistente', name: 'Assistente' },
  { id: 'auxiliar', name: 'Auxiliar' },
  { id: 'estagiario', name: 'Estagiário' },
  { id: 'vendedor', name: 'Vendedor' },
  { id: 'atendente', name: 'Atendente' },
] as const;
export const MEMBER_JOB_TITLE_IDS: readonly string[] = MEMBER_JOB_TITLES.map((title) => title.id);

/**
 * Porte da empresa (item 1C): o `id` é o código gravado em `contas.porte` e o `name`, o texto da tela. Campo separado
 * do tipo jurídico. MEI vem da opção da Receita; ME, EPP e Demais, do código de porte dela.
 */
export const COMPANY_SIZES = [
  { id: 'MEI', name: 'MEI — Microempreendedor Individual' },
  { id: 'ME', name: 'ME — Microempresa' },
  { id: 'EPP', name: 'EPP — Empresa de Pequeno Porte' },
  { id: 'DEMAIS', name: 'Demais empresas' },
] as const;
export type CompanySize = (typeof COMPANY_SIZES)[number]['id'];
export const COMPANY_SIZE_IDS: readonly string[] = COMPANY_SIZES.map((size) => size.id);

/**
 * Tipo jurídico da empresa (item 1C), gravado em `contas.tipo_juridico`. A consulta do CNPJ só sabe distinguir LTDA,
 * EIRELI e SA (a Receita não tem código próprio para SLU, que ela informa como limitada): SLU é ajuste manual.
 */
export const LEGAL_TYPES = [
  { id: 'LTDA', name: 'LTDA — Sociedade Limitada' },
  { id: 'SLU', name: 'SLU — Sociedade Limitada Unipessoal' },
  { id: 'EIRELI', name: 'EIRELI — Empresa Individual de Responsabilidade Limitada' },
  { id: 'SA', name: 'SA — Sociedade Anônima' },
  { id: 'OUTROS', name: 'Outros' },
] as const;
export type LegalType = (typeof LEGAL_TYPES)[number]['id'];
export const LEGAL_TYPE_IDS: readonly string[] = LEGAL_TYPES.map((type) => type.id);

/** Situação cadastral do CNPJ na Receita, gravada em `contas.situacao_cadastral`. */
export const REGISTRATION_STATUSES = ['ATIVA', 'SUSPENSA', 'INAPTA', 'BAIXADA', 'NULA'] as const;
export type RegistrationStatus = (typeof REGISTRATION_STATUSES)[number];

/** Papel da pessoa no módulo, dentro da conta da requisição. */
export const TENDER_ROLES = ['TITULAR', 'COLABORADOR'] as const;
export type TenderRole = (typeof TENDER_ROLES)[number];

/** Como a conta tem o módulo: cortesia (admin, sem cobrança) ou assinatura (migration 0080). */
export const TENDER_ACCESS_TYPES = ['cortesia', 'assinatura'] as const;
export type TenderAccessType = (typeof TENDER_ACCESS_TYPES)[number];

// Histórico de cobrança da assinatura (item 1B), gravado em `cobranca_historico`. Os códigos ficam validados aqui,
// sem CHECK no banco.
export const BILLING_EVENT_TYPES = ['PAGAMENTO', 'ASSINATURA', 'CANCELAMENTO'] as const;
export type BillingEventType = (typeof BILLING_EVENT_TYPES)[number];

/** APROVADO e RECUSADO valem para PAGAMENTO; ATIVADA, para ASSINATURA; CANCELADA, para CANCELAMENTO. */
export const BILLING_EVENT_STATUSES = ['APROVADO', 'RECUSADO', 'ATIVADA', 'CANCELADA'] as const;
export type BillingEventStatus = (typeof BILLING_EVENT_STATUSES)[number];

/** Como o pagamento foi feito; RECORRENTE é a cobrança mensal da assinatura no cartão. */
export const BILLING_METHODS = ['PIX', 'CARTAO', 'RECORRENTE'] as const;
export type BillingMethod = (typeof BILLING_METHODS)[number];

/** Quem encerrou a assinatura recorrente. */
export const BILLING_CANCEL_ORIGINS = ['TITULAR', 'MERCADO_PAGO', 'COBRANCA_RECUSADA'] as const;
export type BillingCancelOrigin = (typeof BILLING_CANCEL_ORIGINS)[number];

/** Avisos do módulo; os de contratos são da migration 0086 e o de contrato novo de concorrente, da 0005 (CHECK de `notificacao.tipo`). */
export const TENDER_NOTIFICATION_TYPES = [
  'NOVO_EDITAL',
  'EDITAL_ALTERADO',
  'PRAZO_3D',
  'PRAZO_1D',
  'CONTRATO_VENCE_90D',
  'CONTRATO_VENCE_30D',
  'CONTRATO_ALTERADO',
  'CONTRATO_NOVO_CONCORRENTE',
] as const;
export type TenderNotificationType = (typeof TENDER_NOTIFICATION_TYPES)[number];

/** Execuções do coletor; as de contratos são da migration 0085, as de vencedores, da 0087c e as de federais, da 0087d. */
export const COLLECTION_RUN_TYPES = [
  'VARREDURA',
  'INCREMENTAL',
  'LEMBRETES',
  'LIMPEZA',
  'MANUAL',
  'CONTRATOS_DIARIA',
  'CONTRATOS_CARGA',
  'CONTRATOS_LIMPEZA',
  'CONTRATOS_AVISOS',
  'VENCEDORES_DIARIA',
  'VENCEDORES_CARGA',
  'FEDERAIS_CARGA',
  'FEDERAIS_CICLO',
] as const;
export type CollectionRunType = (typeof COLLECTION_RUN_TYPES)[number];

/**
 * Tipos de contrato do PNCP (`tipoContrato.id`, lista /v1/tipos-contratos de
 * 18/10/2026), com nomes curtos para a tela. Convênio, TED, ACT e termo de
 * compromisso estão inativos no PNCP, mas aparecem em registros antigos.
 */
export const CONTRACT_TYPES = [
  { id: 1, name: 'Contrato' },
  { id: 2, name: 'Comodato' },
  { id: 3, name: 'Arrendamento' },
  { id: 4, name: 'Concessão' },
  { id: 5, name: 'Termo de adesão' },
  { id: 6, name: 'Convênio' },
  { id: 7, name: 'Empenho' },
  { id: 8, name: 'Outros' },
  { id: 9, name: 'Termo de execução descentralizada' },
  { id: 10, name: 'Acordo de cooperação técnica' },
  { id: 11, name: 'Termo de compromisso' },
  { id: 12, name: 'Carta contrato' },
] as const;
export const CONTRACT_TYPE_IDS: readonly number[] = CONTRACT_TYPES.map((type) => type.id);

/** Tipo de pessoa do fornecedor no PNCP: jurídica, física ou estrangeira. */
export const SUPPLIER_PERSON_TYPES = ['PJ', 'PF', 'PE'] as const;
export type SupplierPersonType = (typeof SUPPLIER_PERSON_TYPES)[number];

export const COLLECTION_RUN_STATUSES = ['EXECUTANDO', 'SUCESSO', 'PARCIAL', 'FALHA'] as const;
export type CollectionRunStatus = (typeof COLLECTION_RUN_STATUSES)[number];

export const DETAIL_CACHE_TYPES = ['ITENS', 'ARQUIVOS'] as const;
export type DetailCacheType = (typeof DETAIL_CACHE_TYPES)[number];
