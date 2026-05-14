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

  subscribeToVendas(_callback: (vendas: Venda[]) => void) {
    return { unsubscribe: () => {} };
  },

  subscribeToEmpreendimentos(_callback: (devs: Empreendimento[]) => void) {
    return { unsubscribe: () => {} };
  },

  subscribeToClientes(_callback: (clientes: Cliente[]) => void) {
    return { unsubscribe: () => {} };
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
