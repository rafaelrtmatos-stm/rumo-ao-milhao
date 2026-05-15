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
  status: "ativo" | "pago" | "atrasado" | "cancelado";
  formaPagamento?: string;
  custo?: number;
  comissao?: number;
  user_id?: string;

  // 👇 ADICIONE ESTES DOIS CAMPOS NOVOS:
  modoAvista?: "dinheiro" | "pix" | "cheque" | "permuta" | "outro";
  descricaoAvista?: string;
}
