export type Section =
  | "dashboard"
  | "vendas"
  | "empreendimentos"
  | "proprietarios"
  | "contratos"
  | "clientes"
  | "aniversarios"
  | "calculadora"
  | "config"
  | "usuarios"
  | "historico";

export interface VendaExcluida {
  venda: Venda;
  dataExclusao: string; // ISO string
  expiresAt: string;    // ISO string (dataExclusao + 30 dias)
}

export interface Venda {
  id: string;
  clienteId: string;
  empreendimentoId: string;
  numeroLote: string;
  quadra: string;
  rua?: string;
  valorLote: number;
  valorEntrada: number;
  quantidadeParcelas: number;
  valorParcela: number;
  dataVencimento: string;
  dataVenda: string;
  vendedor: string;
  vendedorId?: string;
  status: "ativo" | "pago" | "atrasado" | "cancelado" | "pendente" | "rascunho";
  formaPagamento?: string;
  custo?: number;
  comissao?: number;
  user_id?: string;
  modoAvista?: "dinheiro" | "pix" | "cheque" | "permuta" | "outro";
  descricaoAvista?: string;
  numeroContrato?: string;
  clienteNome?: string;
  empreendimentoNome?: string;
  contratoGerado?: boolean;
  contratoSnapshot?: {
    vendedor: {
      nome: string; nacionalidade: string; estadoCivil: string;
      rg: string; cpf: string; endereco: string; numero: string;
      bairro: string; cidade: string; estado: string; cep: string;
    };
    empreendimento: { nome: string; comunidade: string; cidade: string; estado: string };
    extra: {
      rua: string; comunidade: string; formaPagamento: string;
      medidaFrente: string; medidaLateralDir: string; medidaLateralEsq: string;
      medidaFundos: string; areaTotal: string;
    };
    tipoContrato: 'avista' | 'parcelado';
    geradoEm: string;
  };
  rascunho?: boolean;
  medidaFrente?: string;
  medidaLateralDir?: string;
  medidaLateralEsq?: string;
  medidaFundos?: string;
  areaTotal?: string;
  comprador2?: any;
}


export interface Cliente {
  id: string;
  nome: string;
  cpf?: string;
  rg?: string;
  dataNascimento?: string;
  estadoCivil?: string;
  profissao?: string;
  endereco?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  telefone1?: string;
  telefone2?: string;
  telefone3?: string;
  genero?: string;
  dataCadastro?: string;
  [key: string]: any;
}

export interface MapaPontoHistorico {
  clienteAnterior?: string;
  vendaIdAnterior?: string;
  dataVenda?: string;
  dataLiberacao?: string;
  status?: string;
  observacao?: string;
  [key: string]: any;
}

export interface MapaPonto {
  id: string;
  empreendimentoId: string;
  quadra: string;
  lote: string;
  xPercent: number;
  yPercent: number;
  status: "disponivel" | "indisponivel";
  observacao?: string;
  vendaId?: string;
  clienteNome?: string;
  criadoEm: string;
  atualizadoEm: string;
  historico?: MapaPontoHistorico[];
  [key: string]: any;
}

export interface Empreendimento {
  id: string;
  nome: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  totalLotes: number;
  lotesVendidos: number;
  lotesDisponiveis?: number;
  lotesIndisponiveis?: number;
  descricao?: string;
  comunidade?: string;
  quadras?: string;
  ruas?: string;
  ruasPorQuadra?: Record<string, string>;
  ruasFaixas?: any[];
  lotesPorQuadra?: Record<string, { inicio?: number; fim?: number; especificos?: string }>;
  lotesInfo?: Record<string, any>;
  mapaImagemUrl?: string;
  mapaImagemBase64?: string;
  mapaPontos?: MapaPonto[];
  mapaBolinhaTamanho?: "pequena" | "media" | "grande";
  mapaHistorico?: any[];
  [key: string]: any;
}

export interface Vendedor { id: string; nome: string; [key: string]: any; }
export interface Proprietario { id: string; nome: string; cpf: string; genero?: string; estadoCivil?: string; [key: string]: any; }
export interface Address { [key: string]: any; }
export interface AppTheme { [key: string]: any; }
export interface AppConfig {
  vendedores?: Vendedor[];
  proprietarios?: Proprietario[];
  [key: string]: any;
}
