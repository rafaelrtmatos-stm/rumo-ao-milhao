import { useEffect, useRef, useState } from "react";

interface LotePonto {
  id: string; quadra: string; lote: string;
  xPercent: number; yPercent: number; status: string;
  preco?: number; valorEntrada?: number; quantidadeParcelas?: number; valorParcela?: number;
}
interface EmpData {
  id: string; nome: string; cidade?: string; estado?: string;
  mapaImagemUrl?: string; mapaImagemBase64?: string;
  totalLotes?: number; pontos: LotePonto[];
}
type Etapa = "mapa" | "lote" | "dados" | "doc" | "ok";

function validarCelular(num: string): string | null {
  const d = num.replace(/\D/g, "");
  if (d.length < 10 || d.length > 11) return "Número inválido (deve ter 10 ou 11 dígitos)";
  if (/^(\d)\1+$/.test(d)) return "Número inválido (dígitos repetidos)";
  if (d.length === 11 && d[2] !== "9") return "Celular deve começar com 9 após o DDD";
  return null;
}

function formatarCelular(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if (d.length <= 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  return v;
}
function formatarCPF(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}
function formatarCEP(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0,5)}-${d.slice(5)}`;
}

const CORES_FAIXA = ["#3b82f6","#22c55e","#f59e0b","#a855f7","#ef4444","#ec4899","#06b6d4"];

export default function ReservaPublica({ empreendimentoId }: { empreendimentoId: string }) {
  const [emp, setEmp] = useState<EmpData | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("mapa");
  const [loteSel, setLoteSel] = useState<LotePonto | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Form dados pessoais
  const [form, setForm] = useState({
    nome: "", cpf: "", celular: "", email: "",
    cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "",
    dataNascimento: "", estadoCivil: "",
  });
  const [erros, setErros] = useState<Record<string,string>>({});
  const [buscandoCep, setBuscandoCep] = useState(false);

  // Documento
  const [docTipo, setDocTipo] = useState<"CNH"|"RG"|"">("");
  const [docFrente, setDocFrente] = useState<File|null>(null);
  const [docVerso, setDocVerso] = useState<File|null>(null);
  const [docEtapa, setDocEtapa] = useState<"tipo"|"frente"|"verso_pergunta"|"verso"|"pronto">("tipo");

  useEffect(() => {
    fetch(`/api/publico/empreendimento/${empreendimentoId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setErro(d.error); else setEmp(d); })
      .catch(() => setErro("Erro ao carregar empreendimento."))
      .finally(() => setCarregando(false));
  }, [empreendimentoId]);

  const buscarCep = async (cep: string) => {
    const d = cep.replace(/\D/g,"");
    if (d.length !== 8) return;
    setBuscandoCep(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const data = await r.json();
      if (!data.erro) {
        setForm(p => ({...p, rua: data.logradouro || p.rua, bairro: data.bairro || p.bairro, cidade: data.localidade || p.cidade, estado: data.uf || p.estado}));
      }
    } catch {}
    setBuscandoCep(false);
  };

  const validarForm = () => {
    const e: Record<string,string> = {};
    if (!form.nome.trim()) e.nome = "Nome obrigatório";
    if (!form.cpf || form.cpf.replace(/\D/g,"").length !== 11) e.cpf = "CPF inválido";
    const errCel = validarCelular(form.celular);
    if (errCel) e.celular = errCel;
    setErros(e);
    return Object.keys(e).length === 0;
  };

  const uploadArquivo = async (file: File, sufixo: string) => {
    const fd = new FormData();
    const ext = file.name.split(".").pop() || "jpg";
    const nomeBase = form.nome.replace(/[^a-zA-Z0-9]/g,"_").replace(/_+/g,"_");
    const nomeArq = `${nomeBase}_${sufixo}.${ext}`;
    fd.append("arquivo", file, nomeArq);
    fd.append("clienteNome", form.nome);
    fd.append("nomeArquivo", nomeArq);
    const r = await fetch("/api/publico/upload-doc", { method: "POST", body: fd });
    const d = await r.json();
    return { url: d.url || "", nome: nomeArq, tipo: sufixo };
  };

  const handleEnviar = async () => {
    if (!validarForm() || !loteSel || !emp) return;
    setSalvando(true);
    try {
      const documentos: any[] = [];
      if (docTipo === "CNH" && docFrente) {
        const d = await uploadArquivo(docFrente, "CNH");
        documentos.push({...d, data: new Date().toISOString()});
      } else if (docTipo === "RG") {
        if (docFrente && docVerso) {
          const f = await uploadArquivo(docFrente, "RG_Frente");
          const v = await uploadArquivo(docVerso, "RG_Verso");
          documentos.push({...f, data: new Date().toISOString()});
          documentos.push({...v, data: new Date().toISOString()});
        } else if (docFrente) {
          const f = await uploadArquivo(docFrente, "RG_FrenteVerso");
          documentos.push({...f, data: new Date().toISOString()});
        }
      }

      const res = await fetch("/api/publico/pre-reserva", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empreendimentoId: emp.id, empreendimentoNome: emp.nome,
          quadra: loteSel.quadra, numeroLote: loteSel.lote,
          valorLote: loteSel.preco || 0, valorEntrada: loteSel.valorEntrada || 0,
          quantidadeParcelas: loteSel.quantidadeParcelas || 0, valorParcela: loteSel.valorParcela || 0,
          clienteNome: form.nome.trim().toUpperCase(),
          clienteCpf: form.cpf.replace(/\D/g,""),
          clienteTelefone: form.celular,
          clienteWhatsapp: form.celular,
          clienteEmail: form.email,
          clienteDataNascimento: form.dataNascimento,
          clienteEndereco: [form.rua, form.numero, form.bairro, form.cidade, form.estado, form.cep].filter(Boolean).join(", "),
          clienteCep: form.cep, clienteRua: form.rua, clienteNumero: form.numero,
          clienteBairro: form.bairro, clienteCidade: form.cidade, clienteEstado: form.estado,
          clienteEstadoCivil: form.estadoCivil,
          status: "rascunho", origemReserva: "site_publico", documentos,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");
      setEtapa("ok");
    } catch (err: any) {
      alert("Erro ao enviar: " + err.message);
    } finally {
      setSalvando(false);
    }
  };

  const disponivel = (p: LotePonto) => p.status === "disponivel" || !p.status;

  if (carregando) return (
    <div className="min-h-screen bg-[#0f1f0f] flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-14 h-14 border-4 border-green-500/30 border-t-green-500 rounded-full animate-spin mx-auto"/>
        <p className="text-white/50 text-sm">Carregando...</p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="min-h-screen bg-[#0f1f0f] flex items-center justify-center p-6">
      <div className="text-center"><p className="text-4xl mb-4">😕</p><p className="text-white font-bold">{erro}</p></div>
    </div>
  );
  if (!emp) return null;

  const mapaImg = emp.mapaImagemUrl || emp.mapaImagemBase64;

  // ── TELA DE SUCESSO ──
  if (etapa === "ok") return (
    <div className="min-h-screen bg-[#0f1f0f] flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full text-center space-y-5 shadow-2xl">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div>
          <h2 className="text-2xl font-black text-slate-800">Parabéns!</h2>
          <p className="text-slate-500 text-sm mt-1">Sua pré-reserva foi recebida com sucesso.</p>
        </div>
        <div className="bg-green-50 rounded-2xl p-4 text-left space-y-1.5">
          <div className="flex justify-between"><span className="text-xs text-slate-400">Lote</span><span className="text-xs font-black text-slate-700">Q{loteSel?.quadra} — L{loteSel?.lote}</span></div>
          <div className="flex justify-between"><span className="text-xs text-slate-400">Empreendimento</span><span className="text-xs font-black text-slate-700 max-w-[60%] text-right">{emp.nome}</span></div>
          <div className="flex justify-between"><span className="text-xs text-slate-400">Nome</span><span className="text-xs font-black text-slate-700">{form.nome}</span></div>
        </div>
        <p className="text-xs text-slate-400">Nossa equipe entrará em contato em breve pelo WhatsApp para confirmar e finalizar sua compra.</p>
        <div className="text-[10px] text-green-700 font-bold">Rumo ao Milhão • Sistema Imobiliário</div>
      </div>
    </div>
  );

  const inpClass = (campo: string) =>
    `w-full bg-white/10 border rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none transition-all ${erros[campo] ? "border-red-400 bg-red-500/10" : "border-white/20 focus:border-green-500 focus:bg-white/15"}`;

  return (
    <div className="min-h-screen bg-[#0f1f0f] flex flex-col" style={{fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif'}}>
      {/* Header */}
      <div className="bg-[#1a4a1a] px-4 py-3 flex items-center gap-3 shadow-lg sticky top-0 z-20">
        {etapa !== "mapa" && (
          <button onClick={() => {
            if (etapa === "lote") setEtapa("mapa");
            else if (etapa === "dados") setEtapa("lote");
            else if (etapa === "doc") setEtapa("dados");
          }} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 active:scale-90 transition-all">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm truncate">{emp.nome}</p>
          {emp.cidade && <p className="text-white/50 text-[10px] truncate">{emp.cidade}{emp.estado ? `, ${emp.estado}` : ""}</p>}
        </div>
        <span className="text-[10px] text-green-400 font-bold flex-shrink-0">
          {emp.pontos.filter(disponivel).length} disponíveis
        </span>
      </div>

      {/* Barra de progresso */}
      <div className="bg-[#1a4a1a]/40 px-4 py-2 flex gap-1.5">
        {(["mapa","lote","dados","doc"] as Etapa[]).map((e,i) => (
          <div key={e} className={`h-1 flex-1 rounded-full transition-all duration-300 ${["mapa","lote","dados","doc","ok"].indexOf(etapa) >= i ? "bg-green-400" : "bg-white/10"}`}/>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── ETAPA 1: MAPA ── */}
        {etapa === "mapa" && (
          <div className="p-4 space-y-4">
            <div className="text-center">
              <p className="text-white font-black text-xl">Escolha seu lote</p>
              <p className="text-white/40 text-xs mt-1">Toque em uma bolinha <span className="text-green-400 font-bold">verde</span> disponível</p>
            </div>
            <div className="flex justify-center gap-5">
              {[{c:"#22c55e",l:"Disponível"},{c:"#f59e0b",l:"Reservado"},{c:"#ef4444",l:"Indisponível"}].map(x=>(
                <div key={x.l} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:x.c}}/>
                  <span className="text-[10px] text-white/50">{x.l}</span>
                </div>
              ))}
            </div>

            {mapaImg ? (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-slate-900">
                <img src={mapaImg} alt="Mapa" className="w-full block"/>
                {emp.pontos.map(p => {
                  const disp = disponivel(p);
                  const cor = disp ? "#22c55e" : p.status === "reservado" ? "#f59e0b" : "#ef4444";
                  const sel = loteSel?.id === p.id;
                  return (
                    <button key={p.id} disabled={!disp}
                      onClick={() => { if (disp) { setLoteSel(p); setEtapa("lote"); } }}
                      style={{
                        position:"absolute", left:`${p.xPercent}%`, top:`${p.yPercent}%`,
                        transform:`translate(-50%,-50%) scale(${sel?1.4:1})`,
                        width:26, height:26, borderRadius:"50%", background:cor,
                        border:"2px solid white", cursor:disp?"pointer":"default",
                        boxShadow: disp ? `0 0 0 3px ${cor}44` : "none",
                        opacity: disp ? 1 : 0.55, zIndex:10, transition:"transform 0.15s",
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:8, fontWeight:900, color:"white",
                      }}>
                      {p.lote}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/10">
                <p className="text-white/40">Mapa não disponível</p>
                <p className="text-white/30 text-xs mt-1">Escolha na lista abaixo</p>
              </div>
            )}

            {/* Lista de lotes disponíveis */}
            <div className="grid grid-cols-2 gap-2">
              {emp.pontos.filter(disponivel).map(p => (
                <button key={p.id} onClick={() => { setLoteSel(p); setEtapa("lote"); }}
                  className="bg-white/5 hover:bg-green-500/15 border border-white/10 hover:border-green-500/40 rounded-2xl p-3 text-left active:scale-95 transition-all">
                  <p className="text-white font-black text-sm">Q{p.quadra} L{p.lote}</p>
                  {p.preco ? <p className="text-green-400 text-xs font-bold mt-0.5">R$ {Number(p.preco).toLocaleString("pt-BR")}</p>
                    : <p className="text-white/30 text-xs">Consultar preço</p>}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── ETAPA 2: DETALHE DO LOTE ── */}
        {etapa === "lote" && loteSel && (
          <div className="p-4 space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-green-500/20 border border-green-500/30 flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[8px] font-black text-green-400 uppercase">Lote</span>
                  <span className="text-2xl font-black text-green-300 leading-none">{loteSel.lote}</span>
                </div>
                <div>
                  <p className="text-white font-black text-lg">Quadra {loteSel.quadra} · Lote {loteSel.lote}</p>
                  <p className="text-white/50 text-xs">{emp.nome}</p>
                </div>
              </div>
              {loteSel.preco ? (
                <div className="space-y-2 border-t border-white/10 pt-3">
                  {[
                    {l:"Valor total", v:`R$ ${Number(loteSel.preco).toLocaleString("pt-BR")}`, big:true},
                    loteSel.valorEntrada ? {l:"Entrada", v:`R$ ${Number(loteSel.valorEntrada).toLocaleString("pt-BR")}`} : null,
                    (loteSel.quantidadeParcelas && loteSel.valorParcela) ? {l:`${loteSel.quantidadeParcelas}x parcelas`, v:`R$ ${Number(loteSel.valorParcela).toLocaleString("pt-BR","minimumFractionDigits:2" as any)}`} : null,
                  ].filter(Boolean).map((item: any) => (
                    <div key={item.l} className="flex justify-between items-center">
                      <span className="text-white/50 text-sm">{item.l}</span>
                      <span className={`font-black ${item.big ? "text-green-400 text-xl" : "text-white text-sm"}`}>{item.v}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-white/30 text-sm text-center border-t border-white/10 pt-3">Preço a consultar com nossa equipe</p>
              )}
            </div>
            <button onClick={() => setEtapa("dados")}
              className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-base active:scale-95 transition-all shadow-lg">
              🏠 Tenho interesse neste lote →
            </button>
            <button onClick={() => { setLoteSel(null); setEtapa("mapa"); }}
              className="w-full py-3 text-white/40 text-sm font-bold">← Escolher outro lote</button>
          </div>
        )}

        {/* ── ETAPA 3: DADOS PESSOAIS ── */}
        {etapa === "dados" && (
          <div className="p-4 space-y-4 pb-10">
            <div className="text-center">
              <p className="text-white font-black text-lg">Seus dados</p>
              <p className="text-white/40 text-xs mt-1">Lote {loteSel?.lote} · Q{loteSel?.quadra} · {emp.nome}</p>
            </div>

            {/* Identificação */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Identificação</p>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">Nome completo *</label>
                <input className={inpClass("nome")} placeholder="Seu nome completo"
                  value={form.nome} onChange={e => setForm(p=>({...p,nome:e.target.value}))}/>
                {erros.nome && <p className="text-red-400 text-[10px] mt-1 font-bold">{erros.nome}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">CPF *</label>
                <input className={inpClass("cpf")} placeholder="000.000.000-00"
                  value={form.cpf} onChange={e => setForm(p=>({...p,cpf:formatarCPF(e.target.value)}))}/>
                {erros.cpf && <p className="text-red-400 text-[10px] mt-1 font-bold">{erros.cpf}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">Celular / WhatsApp *</label>
                <input className={inpClass("celular")} placeholder="(93) 99999-9999" type="tel"
                  value={form.celular} onChange={e => setForm(p=>({...p,celular:formatarCelular(e.target.value)}))}/>
                {erros.celular && <p className="text-red-400 text-[10px] mt-1 font-bold">{erros.celular}</p>}
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">E-mail</label>
                <input className={inpClass("email")} placeholder="seu@email.com" type="email"
                  value={form.email} onChange={e => setForm(p=>({...p,email:e.target.value}))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Data de nascimento</label>
                  <input className={inpClass("dataNascimento")} type="date"
                    value={form.dataNascimento} onChange={e => setForm(p=>({...p,dataNascimento:e.target.value}))}/>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Estado civil</label>
                  <select className={inpClass("estadoCivil")} value={form.estadoCivil} onChange={e => setForm(p=>({...p,estadoCivil:e.target.value}))}>
                    <option value="">Selecionar</option>
                    {["Solteiro(a)","Casado(a)","Divorciado(a)","Viúvo(a)","União estável"].map(v=>(
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Endereço</p>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">CEP</label>
                <div className="relative">
                  <input className={inpClass("cep")} placeholder="00000-000"
                    value={form.cep} onChange={e => {
                      const v = formatarCEP(e.target.value);
                      setForm(p=>({...p,cep:v}));
                      if (v.replace(/\D/g,"").length === 8) buscarCep(v);
                    }}/>
                  {buscandoCep && <span className="absolute right-3 top-3 text-white/40 text-xs animate-pulse">Buscando...</span>}
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-white/50 mb-1">Rua / Logradouro</label>
                <input className={inpClass("rua")} placeholder="Rua, Avenida..."
                  value={form.rua} onChange={e => setForm(p=>({...p,rua:e.target.value}))}/>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Número</label>
                  <input className={inpClass("numero")} placeholder="Nº"
                    value={form.numero} onChange={e => setForm(p=>({...p,numero:e.target.value}))}/>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Bairro</label>
                  <input className={inpClass("bairro")} placeholder="Bairro"
                    value={form.bairro} onChange={e => setForm(p=>({...p,bairro:e.target.value}))}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Cidade</label>
                  <input className={inpClass("cidade")} placeholder="Cidade"
                    value={form.cidade} onChange={e => setForm(p=>({...p,cidade:e.target.value}))}/>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-white/50 mb-1">Estado</label>
                  <input className={inpClass("estado")} placeholder="PA" maxLength={2}
                    value={form.estado} onChange={e => setForm(p=>({...p,estado:e.target.value.toUpperCase()}))}/>
                </div>
              </div>
            </div>

            <button onClick={() => { if (validarForm()) setEtapa("doc"); }}
              className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-base active:scale-95 transition-all shadow-lg">
              Continuar →
            </button>
          </div>
        )}

        {/* ── ETAPA 4: DOCUMENTO ── */}
        {etapa === "doc" && (
          <div className="p-4 space-y-4 pb-10">
            <div className="text-center">
              <p className="text-white font-black text-lg">Documento</p>
              <p className="text-white/40 text-xs mt-1">Opcional — você pode enviar depois</p>
            </div>

            {/* Escolher tipo */}
            {docEtapa === "tipo" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  {[{tipo:"CNH",icon:"🪪",desc:"Carteira de motorista"},{tipo:"RG",icon:"🆔",desc:"Identidade / RG"}].map(d=>(
                    <button key={d.tipo} onClick={() => { setDocTipo(d.tipo as any); setDocEtapa("frente"); }}
                      className="bg-white/5 hover:bg-white/10 border border-white/10 hover:border-green-500/40 rounded-2xl p-5 text-center active:scale-95 transition-all space-y-2">
                      <p className="text-3xl">{d.icon}</p>
                      <p className="text-white font-black">{d.tipo}</p>
                      <p className="text-white/40 text-[10px]">{d.desc}</p>
                    </button>
                  ))}
                </div>
                <button onClick={handleEnviar} disabled={salvando}
                  className="w-full py-3 rounded-2xl bg-white/5 text-white/50 font-bold text-sm active:scale-95 transition-all">
                  {salvando ? "Enviando..." : "Pular e enviar sem documento"}
                </button>
              </div>
            )}

            {/* CNH ou RG frente */}
            {docEtapa === "frente" && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                  <p className="text-white/60 text-xs">Tipo: <span className="text-white font-black">{docTipo}</span></p>
                </div>
                <p className="text-white/60 text-sm text-center">
                  {docTipo === "CNH" ? "Foto ou PDF da CNH" : "Foto da frente do RG"}
                </p>
                <label className="flex items-center gap-3 p-4 bg-white/5 border-2 border-dashed border-white/20 hover:border-green-500/50 rounded-2xl cursor-pointer transition-all active:scale-95">
                  <span className="text-2xl">{docFrente ? "✅" : "📎"}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{docFrente ? docFrente.name : "Selecionar arquivo"}</p>
                    <p className="text-white/40 text-[10px]">JPG, PNG ou PDF</p>
                  </div>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setDocFrente(e.target.files?.[0] || null)}/>
                </label>
                {docFrente && (
                  <button onClick={() => docTipo === "CNH" ? handleEnviar() : setDocEtapa("verso_pergunta")}
                    disabled={salvando}
                    className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-base active:scale-95 transition-all shadow-lg">
                    {salvando ? "Enviando..." : docTipo === "CNH" ? "✅ Enviar reserva" : "Continuar →"}
                  </button>
                )}
                <button onClick={() => setDocEtapa("tipo")} className="w-full py-2 text-white/30 text-xs">← Trocar tipo</button>
              </div>
            )}

            {/* Pergunta frente e verso juntos */}
            {docEtapa === "verso_pergunta" && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-4 border border-white/10 text-center space-y-2">
                  <p className="text-white font-black">O arquivo já tem frente e verso?</p>
                  <p className="text-white/40 text-xs">Ex: foto tirada com ambos os lados visíveis</p>
                </div>
                <button onClick={handleEnviar} disabled={salvando}
                  className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-base active:scale-95 transition-all">
                  {salvando ? "Enviando..." : "✅ Sim, já tem frente e verso"}
                </button>
                <button onClick={() => setDocEtapa("verso")}
                  className="w-full py-4 rounded-2xl bg-white/10 text-white font-bold text-base active:scale-95 transition-all border border-white/20">
                  ❌ Não, vou adicionar o verso
                </button>
              </div>
            )}

            {/* Verso do RG */}
            {docEtapa === "verso" && (
              <div className="space-y-4">
                <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                  <p className="text-white/60 text-xs">Frente: <span className="text-white font-bold">{docFrente?.name}</span></p>
                </div>
                <p className="text-white/60 text-sm text-center">Agora foto do verso do RG</p>
                <label className="flex items-center gap-3 p-4 bg-white/5 border-2 border-dashed border-white/20 hover:border-green-500/50 rounded-2xl cursor-pointer transition-all active:scale-95">
                  <span className="text-2xl">{docVerso ? "✅" : "📎"}</span>
                  <div>
                    <p className="text-white font-bold text-sm">{docVerso ? docVerso.name : "Selecionar verso"}</p>
                    <p className="text-white/40 text-[10px]">JPG, PNG ou PDF</p>
                  </div>
                  <input type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => setDocVerso(e.target.files?.[0] || null)}/>
                </label>
                {docVerso && (
                  <button onClick={handleEnviar} disabled={salvando}
                    className="w-full py-4 rounded-2xl bg-green-600 text-white font-black text-base active:scale-95 transition-all shadow-lg">
                    {salvando ? "Enviando..." : "✅ Enviar reserva"}
                  </button>
                )}
                <button onClick={() => setDocEtapa("verso_pergunta")} className="w-full py-2 text-white/30 text-xs">← Voltar</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
