import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function apiFetch(path: string, options?: RequestInit): Promise<any> {
  const res = await fetch(path, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error || `Erro ${res.status}`);
  }
  return res.json();
}

let currentUserId = '';

export function setCurrentUser(id: string) {
  currentUserId = id;
}

function assertUser() {
  if (!currentUserId) throw new Error('Usuário não autenticado.');
}

export const dbService = {

  async getEmpreendimentos(): Promise<Empreendimento[]> {
    assertUser();
    return apiFetch('/api/empreendimentos');
  },

  async saveEmpreendimentos(items: Empreendimento[]): Promise<void> {
    assertUser();
    await apiFetch('/api/empreendimentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
  },

  async deleteEmpreendimento(id: string): Promise<void> {
    assertUser();
    const all = await dbService.getEmpreendimentos();
    const filtered = all.filter((e) => e.id !== id);
    await dbService.saveEmpreendimentos(filtered);
  },

  async getClientes(): Promise<Cliente[]> {
    assertUser();
    return apiFetch('/api/clientes');
  },

  async saveClientes(items: Cliente[]): Promise<void> {
    assertUser();
    await apiFetch('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
  },

  async getVendas(): Promise<Venda[]> {
    assertUser();
    return apiFetch('/api/vendas');
  },

  async saveVendas(items: Venda[]): Promise<void> {
    assertUser();
    await apiFetch('/api/vendas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(items),
    });
  },

  async getAppConfig(): Promise<AppConfig> {
    if (!currentUserId) return { theme: 'standard' };
    try {
      return await apiFetch('/api/config');
    } catch {
      return { theme: 'standard' };
    }
  },

  async saveAppConfig(config: AppConfig): Promise<void> {
    assertUser();
    await apiFetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
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
      const cls: Cliente[] = rawClientes ? JSON.parse(rawClientes) : [];
      const vds: Venda[] = rawVendas ? JSON.parse(rawVendas) : [];

      if (!devs.length && !cls.length && !vds.length) {
        return { ok: false, msg: 'Nenhum dado encontrado no localStorage para migrar.' };
      }

      if (devs.length) await dbService.saveEmpreendimentos(devs);
      if (cls.length) await dbService.saveClientes(cls);
      if (vds.length) await dbService.saveVendas(vds);

      localStorage.removeItem('lotes_empreendimentos');
      localStorage.removeItem('lotes_clientes');
      localStorage.removeItem('lotes_vendas');
      localStorage.removeItem('lotes_config');

      return {
        ok: true,
        msg: `Migração concluída! ${devs.length} empreendimento(s), ${cls.length} cliente(s) e ${vds.length} venda(s) migrados.`,
      };
    } catch (err) {
      console.error('migrateFromLocalStorage:', err);
      return { ok: false, msg: 'Erro durante a migração. Verifique o console.' };
    }
  },
};
