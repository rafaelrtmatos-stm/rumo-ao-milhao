import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function apiGet(path: string): Promise<any> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    throw new Error(`Erro ${res.status} ao buscar ${path}`);
  }
  return res.json();
}

async function apiPost(path: string, body: any): Promise<any> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error('Unauthorized');
    let detail = '';
    try { const j = await res.json(); detail = j.error || j.message || ''; } catch {}
    throw new Error(detail || `Erro ${res.status} ao salvar em ${path}`);
  }
  return res.json();
}

/**
 * Polling simples para simular realtime.
 * O banco é Postgres puro (sem Supabase Realtime), então fazemos
 * polling a cada 15s. Só chama o callback se os dados mudaram.
 */
function createPoller<T>(
  fetchFn: () => Promise<T>,
  callback: (data: T) => void,
  intervalMs = 15000,
) {
  let stopped = false;
  let lastJson = '';

  const poll = async () => {
    if (stopped) return;
    try {
      const data = await fetchFn();
      const json = JSON.stringify(data);
      if (json !== lastJson) {
        lastJson = json;
        callback(data);
      }
    } catch {
      // ignora erros silenciosamente (ex: usuário não autenticado ainda)
    }
    if (!stopped) setTimeout(poll, intervalMs);
  };

  // Começa depois do load inicial para não conflitar
  setTimeout(poll, intervalMs);

  return { unsubscribe: () => { stopped = true; } };
}

export const dbService = {

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    return apiGet('/api/empreendimentos');
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    await apiPost('/api/empreendimentos', items);
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    const all = await dbService.getEmpreendimentos();
    await dbService.saveEmpreendimentos(all.filter((e) => e.id !== id));
  },

  async getClientes(): Promise<Cliente[]> {
    return apiGet('/api/clientes');
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    await apiPost('/api/clientes', items);
  },

  async getVendas(): Promise<Venda[]> {
    return apiGet('/api/vendas');
  },

  async saveVendas(items: Venda[]): Promise<void> {
    await apiPost('/api/vendas', items);
  },

  async getAppConfig(): Promise<AppConfig> {
    try {
      return await apiGet('/api/config');
    } catch {
      return { theme: 'standard' };
    }
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    await apiPost('/api/config', config);
  },

  subscribeToVendas(callback: (vendas: Venda[]) => void) {
    return createPoller(() => dbService.getVendas(), callback);
  },

  subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void) {
    return createPoller(() => dbService.getEmpreendimentos(), callback);
  },

  subscribeToClientes(callback: (clientes: Cliente[]) => void) {
    return createPoller(() => dbService.getClientes(), callback);
  },

  async migrateFromLocalStorage(): Promise<{ ok: boolean; msg: string }> {
    try {
      const rawDevs = localStorage.getItem('lotes_empreendimentos');
      const rawClientes = localStorage.getItem('lotes_clientes');
      const rawVendas = localStorage.getItem('lotes_vendas');

      const devs: Empreendimento[] = rawDevs ? JSON.parse(rawDevs) : [];
      const clientes: Cliente[] = rawClientes ? JSON.parse(rawClientes) : [];
      const vendas: Venda[] = rawVendas ? JSON.parse(rawVendas) : [];

      if (!devs.length && !clientes.length && !vendas.length) {
        return { ok: false, msg: 'Nenhum dado encontrado no localStorage para migrar.' };
      }

      if (devs.length) await dbService.saveEmpreendimentos(devs);
      if (clientes.length) await dbService.saveClientes(clientes);
      if (vendas.length) await dbService.saveVendas(vendas);

      localStorage.removeItem('lotes_empreendimentos');
      localStorage.removeItem('lotes_clientes');
      localStorage.removeItem('lotes_vendas');
      localStorage.removeItem('lotes_config');

      return {
        ok: true,
        msg: `Migração concluída! ${devs.length} empreendimento(s), ${clientes.length} cliente(s) e ${vendas.length} venda(s) migrados.`,
      };
    } catch (err) {
      console.error('migrateFromLocalStorage:', err);
      return { ok: false, msg: 'Erro durante a migração. Verifique o console.' };
    }
  },
};
