import { Empreendimento, Cliente, Venda, AppConfig } from './types';

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPost(path: string, body: any): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
}

export const dbService = {
  async getEmpreendimentos(): Promise<Empreendimento[]> {
    return apiGet<Empreendimento[]>('/api/empreendimentos');
  },
  async saveEmpreendimentos(items: Empreendimento[]) {
    await apiPost('/api/empreendimentos', items);
  },

  async getClientes(): Promise<Cliente[]> {
    return apiGet<Cliente[]>('/api/clientes');
  },
  async saveClientes(items: Cliente[]) {
    await apiPost('/api/clientes', items);
  },

  async getVendas(): Promise<Venda[]> {
    return apiGet<Venda[]>('/api/vendas');
  },
  async saveVendas(items: Venda[]) {
    await apiPost('/api/vendas', items);
  },

  async getAppConfig(): Promise<AppConfig> {
    return apiGet<AppConfig>('/api/config');
  },
  async saveAppConfig(config: AppConfig) {
    await apiPost('/api/config', config);
  },
};
