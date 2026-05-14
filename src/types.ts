export interface Address {
  cep: string;
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  complemento?: string;
}

export interface Empreendimento {
  id: string;
  nome: string;
  endereco: string;
  cidade: string;
  estado: string;
  totalLotes: number;
  descricao: string;
  lotesVendidos: number;
  comunidade?: string;
  quadras?: string;
  ruas?: string;
  ruasPorQuadra?: Record<string, string>; // Legado — mantido para compatibilidade
  ruasFaixas?: Array<{ quadra: string; loteInicio: number; loteFim: number; rua: string }>; // Faixas de lotes por rua (ex: Q1, lotes 1-4 → Rua Principal)
  lotesInfo?: Record<string, { rua: string }>; // Chave: 'QUADRA-LOTE', Valor: { rua: 'Nome da Rua' }

}

export interface Cliente {
  id: string;
  nome: string;
  nacionalidade: string;
  genero: 'M' | 'F' | 'O';
  rg: string;
  cpf: string;
  estadoCivil: string;
  profissao: string;
  nascimento: string;
  cep: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  telefone1: string;
  telefone2?: string;
  dataCadastro: string;
}

export interface Vendedor {
  id: string;
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  rg: string;
  cpf: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}

export interface Proprietario {
  id: string;
  nome: string;
  nacionalidade: string;
  estadoCivil: string;
  rg: string;
  cpf: string;
  endereco: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
}

export interface Venda {
  id: string;
  numeroContrato: string;
  clienteId: string;
  clienteNome: string;
  empreendimentoId: string;
  empreendimentoNome: string;
  numeroLote: string;
  quadra: string;
  rua: string;
  valorLote: number;
  valorEntrada: number;
  quantidadeParcelas: number;
  valorParcela: number;
  dataVencimento: string;
  vendedor: string;
  vendedorId?: string;
  dataVenda: string;
  custo: number;
  comissao: number;
  formaPagamento: string;
  status?: 'pendente' | 'pago' | 'cancelado';
  comprador2?: {
    nome: string;
    nacionalidade: string;
    genero: 'M' | 'F' | 'O';
    rg: string;
    cpf: string;
    estadoCivil: string;
    nascimento: string;
    profissao: string;
  };
  medidaFrente?: string;
  medidaLateralDir?: string;
  medidaLateralEsq?: string;
  medidaFundos?: string;
  areaTotal?: string;
}

export type AppTheme = 'standard' | 'blue-gradient' | 'dark';

export interface AppConfig {
  theme: AppTheme;
  vendedores?: Vendedor[];
  proprietarios?: Proprietario[];
}

export type Section = 'dashboard' | 'empreendimentos' | 'vendas' | 'contratos' | 'clientes' | 'aniversarios' | 'calculadora' | 'config' | 'proprietarios' | 'usuarios';
