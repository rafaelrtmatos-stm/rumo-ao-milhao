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
