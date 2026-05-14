import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ${res.status}`);
  }
  return res.json();
}

export const dbService = {

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    return apiFetch('/api/empreendimentos');
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    await apiFetch('/api/empreendimentos', { method: 'POST', body: JSON.stringify(items) });
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    const all = await dbService.getEmpreendimentos();
    const filtered = all.filter((e) => e.id !== id);
    await dbService.saveEmpreendimentos(filtered);
  },

  async getClientes(): Promise<Cliente[]> {
    return apiFetch('/api/clientes');
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    await apiFetch('/api/clientes', { method: 'POST', body: JSON.stringify(items) });
  },

  async getVendas(): Promise<Venda[]> {
    return apiFetch('/api/vendas');
  },

  async saveVendas(items: Venda[]): Promise<void> {
    await apiFetch('/api/vendas', { method: 'POST', body: JSON.stringify(items) });
  },

  async getAppConfig(): Promise<AppConfig> {
    try {
      return await apiFetch('/api/config');
    } catch {
      return { theme: 'standard' };
    }
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    await apiFetch('/api/config', { method: 'POST', body: JSON.stringify(config) });
  },

  subscribeToVendas(callback: (vendas: Venda[]) => void) {
    dbService.getVendas().then(callback).catch(() => {});
    return { unsubscribe: () => {} };
  },

  subscribeToEmpreendimentos(callback: (devs: Empreendimento[]) => void) {
    dbService.getEmpreendimentos().then(callback).catch(() => {});
    return { unsubscribe: () => {} };
  },

  subscribeToClientes(callback: (clientes: Cliente[]) => void) {
    dbService.getClientes().then(callback).catch(() => {});
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
