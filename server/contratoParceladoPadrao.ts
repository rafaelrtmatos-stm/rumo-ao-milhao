import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  UnderlineType,
} from "docx";

function inteiroExtenso(n: number): string {
  if (n === 0) return "zero";
  const unidades = [
    "", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove",
    "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
  ];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];

  if (n === 100) return "cem";
  if (n === 1000) return "mil";
  if (n < 20) return unidades[n];
  if (n < 100) {
    const dez = Math.floor(n / 10);
    const un = n % 10;
    return dezenas[dez] + (un > 0 ? " e " + unidades[un] : "");
  }
  if (n < 1000) {
    const cent = Math.floor(n / 100);
    const rest = n % 100;
    return centenas[cent] + (rest > 0 ? " e " + inteiroExtenso(rest) : "");
  }
  if (n < 1000000) {
    const mil = Math.floor(n / 1000);
    const rest = n % 1000;
    const milText = mil === 1 ? "mil" : inteiroExtenso(mil) + " mil";
    if (rest === 0) return milText;
    const useE = rest < 100 || rest % 100 === 0;
    return milText + (useE ? " e " : " ") + inteiroExtenso(rest);
  }
  const mi = Math.floor(n / 1000000);
  const rest = n % 1000000;
  const miText = mi === 1 ? "um milhão" : inteiroExtenso(mi) + " milhões";
  if (rest === 0) return miText;
  return miText + " e " + inteiroExtenso(rest);
}

function valorExtenso(n: number): string {
  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);
  const intText = inteiroExtenso(intPart);
  const label = intPart === 1 ? "Real" : "Reais";
  if (cents === 0) return intText + " " + label;
  const centsText = inteiroExtenso(cents);
  const centsLabel = cents === 1 ? "centavo" : "centavos";
  return intText + " " + label + " e " + centsText + " " + centsLabel;
}

function capitalizar(s: string): string {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function brl(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataExtenso(date: Date): string {
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}

function diaDoMes(dateStr: string): number {
  if (!dateStr) return 1;
  const d = new Date(dateStr + "T12:00:00");
  return d.getDate();
}

function primeiraParcela(dateStr: string): string {
  if (!dateStr) return "___/___/______";
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("pt-BR");
}

interface ContratoParams {
  vendedor: {
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
  };
  cliente: {
    nome: string;
    nacionalidade: string;
    genero: "M" | "F" | "O";
    estadoCivil: string;
    rg: string;
    cpf: string;
    profissao?: string;
    endereco: string;
    numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  };
  empreendimento: {
    nome: string;
    comunidade?: string;
    cidade?: string;
    estado?: string;
  };
  venda: {
    numeroLote: string;
    quadra: string;
    rua?: string;
    valorLote: number;
    valorEntrada: number;
    quantidadeParcelas: number;
    valorParcela: number;
    dataVencimento: string;
    dataVenda: string;
    medidaFrente?: string;
    medidaLateralDir?: string;
    medidaLateralEsq?: string;
    medidaFundos?: string;
    areaTotal?: string;
  };
}

export async function gerarContratoParceladoPadrao(params: ContratoParams): Promise<Buffer> {
  const { vendedor, cliente, empreendimento, venda } = params;

  const isF = cliente.genero === "F";
  const compradorLabel = isF ? "COMPRADORA" : "COMPRADOR";
  const brasileiroLabel = isF ? "brasileira" : "brasileiro";
  const portadorLabel = isF ? "portadora" : "portador";
  const residenteLabel = isF ? "residente e domiciliada" : "residente e domiciliado";
  const aLabel = isF ? "a " : "o ";
  const daLabel = isF ? "da " : "do ";

  const saldoDevedor = venda.valorLote - venda.valorEntrada;
  const corretagem = venda.valorLote * 0.08;
  const desistencia = venda.valorLote * 0.17;

  const cidade = empreendimento.cidade || "Santarém";
  const estado = empreendimento.estado || "PA";
  const localidade = `${cidade}-${estado}`;

  const dataVendaDate = new Date((venda.dataVenda || new Date().toISOString()).split("T")[0] + "T12:00:00");

  const dimStr = venda.medidaFrente
    ? `medindo ${venda.medidaFrente} metros de frente, lateral direita medindo ${venda.medidaLateralDir || "___"} metros, pela lateral esquerda medindo ${venda.medidaLateralEsq || "___"} e medindo ${venda.medidaFundos || "___"} metros de fundos, com área total de ${venda.areaTotal || "___"} metros quadrados`
    : `medindo ___ metros de frente, lateral direita medindo ___ metros, pela lateral esquerda medindo ___ e medindo ___ metros de fundos, com área total de ___ metros quadrados`;

  const font = "Times New Roman";
  const sz = 24;

  const run = (text: string, bold = false, underline = false) =>
    new TextRun({
      text,
      bold,
      underline: underline ? { type: UnderlineType.SINGLE } : undefined,
      font,
      size: sz,
    });

  const par = (children: TextRun[], align = AlignmentType.JUSTIFIED, spacingAfter = 200) =>
    new Paragraph({
      alignment: align,
      spacing: { after: spacingAfter },
      children,
    });

  const heading = (text: string) =>
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { before: 280, after: 160 },
      children: [run(text, true)],
    });

  const blank = () =>
    new Paragraph({ children: [run("")], spacing: { after: 0 } });

  const centered = (children: TextRun[], spacingAfter = 160) =>
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: spacingAfter }, children });

  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children: [
        centered([run("COMPROMISSO DE COMPRA E VENDA DE IMÓVEL", true, true)], 200),
        centered([run("DADOS/ VENDEDOR/ COMPRADOR", true)], 320),

        par([
          run("Pelo presente instrumento particular de compra e venda de imóvel, de um lado o Sr. "),
          run(vendedor.nome.toUpperCase(), true),
          run(", " + vendedor.nacionalidade + ", " + vendedor.estadoCivil.toLowerCase() + ", portador da carteira de identidade nº " + vendedor.rg + " e do CPF nº " + vendedor.cpf + ", residente e domiciliado na " + vendedor.endereco + ", n° " + vendedor.numero + ", " + vendedor.bairro + ", " + vendedor.cidade + ", " + vendedor.estado + ", CEP " + vendedor.cep + ", ora em diante chamado simplesmente de VENDEDOR de outro " + (isF ? "a Sra. " : "o Sr. ")),
          run(cliente.nome.toUpperCase(), true),
          run(", " + brasileiroLabel + ", " + cliente.estadoCivil.toLowerCase() + ", " + portadorLabel + " da carteira de identidade nº " + cliente.rg + " e do CPF nº " + cliente.cpf + (cliente.profissao ? ", " + cliente.profissao : "") + ", " + residenteLabel + " na " + cliente.endereco + ", nº " + cliente.numero + ", " + cliente.bairro + ", " + cliente.cidade + "/" + cliente.estado + ", CEP " + cliente.cep + ", ora em diante chamado simplesmente de " + compradorLabel + ":"),
        ]),

        blank(),
        heading("1º DO OBJETO"),

        par([
          run("A posse que exerce sobre 1 (Um) Terreno Rural, extraído de uma área localizada " + (empreendimento.comunidade ? "na " + empreendimento.comunidade + ", " : "") + "no desmembramento do lote Empreendimento "),
          run(empreendimento.nome.toUpperCase(), true),
          run(" no município de " + cidade + "/" + estado + ", de forma regular. Denominado "),
          run("Lote " + venda.numeroLote + " da Quadra (" + venda.quadra + ")", true),
          run(", " + (venda.rua ? venda.rua + ", " : "") + dimStr + "."),
        ]),

        par([
          run("§ Parágrafo único - Pelo presente instrumento e na melhor forma de direito, o VENDEDOR, têm ajustado vender conforme promete " + daLabel + compradorLabel + ", e este a comprar-lhe o imóvel descrito e caracterizado na cláusula anterior, de forma livre e desembaraçado de quaisquer ônus (real, pessoal, fiscal ou extrajudicial), dívidas, arrestos ou sequestros, ou ainda de restrições de qualquer natureza, pelo preço e de conformidade com as cláusulas e condições adiante estabelecidas."),
        ]),

        blank(),
        heading("2º DO VALOR"),

        par([
          run("O preço certo e ajustado da venda ora prometido é de "),
          run(brl(venda.valorLote) + " (" + capitalizar(valorExtenso(venda.valorLote)) + ")", true),
          run(", sendo que o valor de "),
          run(brl(venda.valorEntrada) + " (" + capitalizar(valorExtenso(venda.valorEntrada)) + ")", true),
          run(", será pago a título de sinal na data da assinatura deste contrato, e o restante do valor, "),
          run(brl(saldoDevedor) + " (" + capitalizar(valorExtenso(saldoDevedor)) + ")", true),
          run(", será quitado, assinando 1 (uma) nota promissória no valor total do parcelamento fracionado através de "),
          run(venda.quantidadeParcelas + " (" + capitalizar(inteiroExtenso(venda.quantidadeParcelas)) + ")", true),
          run(" parcelas fixas, no valor de "),
          run(brl(venda.valorParcela) + " (" + capitalizar(valorExtenso(venda.valorParcela)) + ")", true),
          run(" cada uma, com vencimento todo dia " + diaDoMes(venda.dataVencimento) + " de cada mês subsequente, ficando a primeira parcela para " + primeiraParcela(venda.dataVencimento) + "."),
        ]),

        blank(),
        heading("3º DO INADIMPLEMENTO DA OBRIGAÇÃO"),

        par([
          run("A " + compradorLabel + " obriga-se a pagar pontualmente cada uma das " + venda.quantidadeParcelas + " (" + capitalizar(inteiroExtenso(venda.quantidadeParcelas)) + ") parcelas ao VENDEDOR, sob pena de, não o fazendo e sem prejuízo das demais sanções previstas em caso de inadimplemento, ficar sujeito ao pagamento de multa moratória de 2% (dois por cento) e juros moratórios de 1% (um por cento) ao mês, calculados por dia (pro rata die) a partir do vencimento, sobre o valor da parcela em atraso. Além disso, após 90 (noventa) dias de inadimplemento, poderá ser caracterizado o inadimplemento total, com as consequências previstas na cláusula seguinte."),
        ]),

        blank(),
        heading("4º DA CORRETAGEM"),

        par([
          run("Caso alguma parte vier a arrepender-se da presente transação, o valor correspondente a 8% (oito por cento) do valor pactuado total do objeto, equivalente a "),
          run(brl(corretagem) + " (" + capitalizar(valorExtenso(corretagem)) + ")", true),
          run(", destinado ao pagamento de honorários de corretagem, não integrará qualquer valor passível de restituição."),
        ]),

        blank(),
        heading("5º DA RESCISÃO CONTRATUAL E CONSEQUÊNCIAS"),

        par([
          run("O presente contrato será rescindido automaticamente 90 (noventa) dias após " + aLabel + compradorLabel + " deixar de pagar qualquer das parcelas pactuadas neste instrumento na data do respectivo vencimento, operando-se a rescisão em favor do VENDEDOR, independentemente de aviso judicial ou extrajudicial. Em consequência, perderá " + aLabel + compradorLabel + ", desde logo, a posse do imóvel prometido. Do valor total efetivamente pago até a data do inadimplemento será retida multa compensatória correspondente a 30% (trinta por cento), sem prejuízo da multa de mora e dos juros, conforme previsto na cláusula anterior, além das custas processuais e honorários advocatícios, se houver."),
        ]),

        par([
          run("§1º - As benfeitorias e construções que " + aLabel + compradorLabel + " vier a realizar no imóvel deverão fazer parte integrante do mesmo, e em caso de rescisão do presente contrato, não terá " + aLabel + compradorLabel + ", direito a indenização, reembolso em obra ou benfeitorias feitas no terreno."),
        ]),

        blank(),
        heading("6º DO ARREPENDIMENTO"),

        par([
          run("Em caso de arrependimento " + daLabel + compradorLabel + ", mesmo obedecerá, o código de defesa do consumidor (lei Nº 8.078, DE 11 DE SETEMBRO DE 1990) de acordo com artigo 49, ou seja, prazo 07 (dias)."),
        ]),

        blank(),
        heading("7º DA DESISTÊNCIA"),

        par([
          run("A parte que desistir do negócio ou der causa à rescisão deste contrato arcará com multa de 17% (dezessete por cento) do valor do presente contrato, equivalente a "),
          run(brl(desistencia) + " (" + capitalizar(valorExtenso(desistencia)) + ")", true),
          run(", a ser pago a outra parte, sem prejuízo das perdas e danos decorrentes do ato."),
        ]),

        blank(),
        heading("8º DA POSSE E SUAS OBRIGAÇÕES"),

        par([
          run("A posse do imóvel, objeto deste contrato, é transmitida pelo VENDEDOR " + aLabel + compradorLabel + " após a assinatura deste contrato."),
        ]),

        par([
          run("§ 1º A partir da posse do imóvel, correrão por conta exclusiva " + daLabel + compradorLabel + ", todos os impostos, taxas ou contribuições fiscais de qualquer natureza incidentes sobre o imóvel objeto deste contrato e por estes deverão ser pagos nas épocas próprias e nas repartições competentes, ainda que lançados em nome do VENDEDOR ou de terceiros, assim como serão, desde já, de sua inteira responsabilidade, as despesas com o registro deste contrato e outras de qualquer natureza e espécie."),
        ]),

        par([
          run("§ 2º Fica advertido " + aLabel + compradorLabel + " que a responsabilidade de limpeza do seu lote é de estrita obrigação sua, devendo a mesma retirar entulhos (ex: árvore, resto de material de construção e matos), para não prejudicar outros lotes."),
        ]),

        par([
          run("Conforme cláusula 9º §2º, será o dever " + daLabel + compradorLabel + " ressarcir os serviços prestados pelo VENDEDOR, para resolver o conflito."),
        ]),

        blank(),
        heading("09º DA ANUÊNCIA DO VENDEDOR"),

        par([
          run(aLabel.charAt(0).toUpperCase() + aLabel.slice(1) + compradorLabel + " poderá ceder e transferir os direitos que lhes decorrem deste contrato apenas com anuência do VENDEDOR, caso o mesmo faça a transferência sem comunicar, será considerado má-fé contratual, fazendo nulidade absoluta a terceiros."),
        ]),

        blank(),
        heading("10º DA IRREVOGABILIDADE E IRRETRATABILIDADE"),

        par([
          run("O presente contrato é celebrado em caráter irrevogável e irretratável pelo VENDEDOR e " + compradorLabel + ", seus herdeiros e sucessores excluídos ficam expressamente a hipótese de arrependimento."),
        ]),

        blank(),
        heading("11º DA VISTORIA"),

        par([
          run(aLabel.charAt(0).toUpperCase() + aLabel.slice(1) + compradorLabel + " viu, examinou e vistoriou o imóvel no local, e o aceita no estado que se encontra."),
        ]),

        blank(),
        heading("12º DA NOTIFICAÇÃO E COBRANÇA"),

        par([
          run("O VENDEDOR fica autorizado pel" + (isF ? "a " : "o ") + compradorLabel + ", em caso de atraso, notificar extrajudicial, ou enviar mensagens de cobrança, em todas as vias disponíveis de comunicação (Ex: telefone, E-mail, WhatsApp, Facebook)."),
        ]),

        blank(),
        heading("13º DA PROTEÇÃO DE DADOS"),

        par([
          run("A Lei Geral de Proteção de Dados será obedecida, em todos os seus termos, pelo vendedor, obrigando-se ele a tratar os dados " + daLabel + compradorLabel + " que forem eventualmente coletados, conforme sua necessidade ou obrigatoriedade."),
        ]),

        par([
          run("§1º Conforme prevê a Lei Geral de Proteção de Dados, obriga-se o vendedor a executar os seus trabalhos e tratar os dados " + daLabel + compradorLabel + " respeitando os princípios da finalidade, adequação, transparência, livre acesso, segurança, prevenção e não discriminação. (Art. 6o, LGPD)."),
        ]),

        par([
          run("§2º Conforme prevê a Lei Geral de Proteção de Dados, obriga-se o VENDEDOR a executar os seus trabalhos e tratar os dados " + daLabel + compradorLabel + " respeitando os princípios da finalidade, adequação, transparência, livre acesso, segurança, prevenção e não discriminação. (Art. 6o, LGPD)."),
        ]),

        par([
          run("§3º Eventuais dados coletados pelo VENDEDOR serão arquivados somente pelo tempo necessário para a execução dos serviços contratados. Ao seu fim, os dados coletados serão permanentemente eliminados, excetuando-se os que se enquadrarem no disposto no artigo 16, I da Lei Geral de Proteção de Dados. (art. 15, LGPD)."),
        ]),

        blank(),
        heading("14º DO FALECIMENTO"),

        par([
          run("Caso " + aLabel + compradorLabel + " venha a óbito no lapso de tempo do contrato, os herdeiros assumirão a dívida restante do objeto, no prazo de 30 (trinta) dias. Caso os mesmos fiquem inertes às obrigações, o VENDEDOR terá direito de reaver o imóvel, sem indenização de obras ou benfeitorias no terreno."),
        ]),

        blank(),
        heading("15º DA COMPETÊNCIA DE FORO"),

        par([
          run("Para dirimir quaisquer questões que direta ou indiretamente decorrem deste contrato, as partes elegem o Foro da Comarca de " + localidade + ", com renúncia expressa de qualquer outro, por mais privilegiado que seja."),
        ]),

        par([
          run("§1º Para todos os fins e efeitos de direito, os contratantes declaram aceitar o presente contrato nos expressos termos em que foi lavrado, obrigando-se a si, seus herdeiros e sucessores a bem e fielmente cumpri-lo. E, por estarem assim ajustados, firmam o presente instrumento particular em 02 (Duas) vias de igual teor e forma, na presença das testemunhas que também o assinam."),
        ]),

        blank(),
        blank(),
        blank(),

        centered([run(localidade + ", " + dataExtenso(dataVendaDate))], 600),

        blank(),
        blank(),
        blank(),
        blank(),
        blank(),

        centered([run("_______________________________________")], 80),
        centered([run("VENDEDOR – " + vendedor.nome.toUpperCase(), true)], 60),
        centered([run("CPF nº " + vendedor.cpf)], 600),

        blank(),
        blank(),
        blank(),
        blank(),

        centered([run("_______________________________________")], 80),
        centered([run(compradorLabel + " – " + cliente.nome.toUpperCase(), true)], 60),
        centered([run("CPF nº " + cliente.cpf)], 600),

        blank(),
        blank(),

        par([run("Testemunhas:", true)], AlignmentType.LEFT, 400),

        new Paragraph({
          spacing: { after: 80 },
          children: [
            run("1º ___________________________"),
            new TextRun({ text: "\t\t\t\t", font, size: sz }),
            run("2º ___________________________"),
          ],
        }),
      ],
    }],
  });

  return await Packer.toBuffer(doc);
}
