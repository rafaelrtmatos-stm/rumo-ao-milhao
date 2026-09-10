/**
 * mapaStorage.ts
 * Upload binário de mapas para Supabase Storage.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'mapas';

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return null;
  }
  if (!supabaseClient) {
    try {
      supabaseClient = createClient(url, key);
    } catch (e) {
      console.warn('[mapaStorage] Falha ao inicializar Supabase:', e);
      return null;
    }
  }
  return supabaseClient;
}

/** Comprime imagem para WEBP e faz upload binário. Retorna URL pública. */
export async function uploadMapaImagem(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);

  // 1. Converter para WEBP comprimido
  const webpBlob = await comprimirParaWebP(file, 0.82);
  onProgress?.(40);

  return uploadMapaBlob(webpBlob, empreendimentoId, onProgress, 'webp', 'image/webp');
}

/** Faz upload direto de um Blob (WEBP/PNG) para o Supabase Storage. Retorna URL pública. */
export async function uploadMapaBlob(
  blob: Blob,
  empreendimentoId: string,
  onProgress?: (pct: number) => void,
  ext: string = 'webp',
  contentType: string = 'image/webp'
): Promise<string> {
  onProgress?.(40);
  const nome = `${empreendimentoId}_${Date.now()}.${ext}`;
  const file = new File([blob], `mapa.${ext}`, { type: contentType });

  const supabase = getSupabase();
  if (supabase) {
    try {
      // 3. Tentar upload direto
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(nome, file, {
          contentType,
          upsert: true,
          duplex: 'half',
        } as any);

      if (!error) {
        onProgress?.(90);
        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(nome);
        onProgress?.(100);
        return urlData.publicUrl;
      }

      console.warn('[storage] Upload direto falhou:', error.message, '— tentando com path alternativo');

      // 4. Fallback: tentar com userId no path
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || 'shared';
      const nomeAlt = `${userId}/${nome}`;

      const { error: error2 } = await supabase.storage
        .from(BUCKET)
        .upload(nomeAlt, file, {
          contentType,
          upsert: true,
        });

      if (!error2) {
        onProgress?.(90);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeAlt);
        onProgress?.(100);
        return data.publicUrl;
      }
      console.warn('[storage] Upload blob falhou:', error2.message);
    } catch (err: any) {
      console.warn('[storage] Erro na comunicação com Supabase (blob):', err?.message || err);
    }
  }

  // 5. Último fallback: base64 (funciona sem storage configurado)
  onProgress?.(70);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      onProgress?.(100);
      resolve(reader.result as string);
    };
    reader.onerror = () => reject(new Error('Falha ao ler blob'));
    reader.readAsDataURL(blob);
  });
}

/** Comprime File para WEBP via Canvas. */
async function comprimirParaWebP(file: File, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      const MAX = 4000;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        const ratio = Math.min(MAX / width, MAX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Canvas toBlob falhou')),
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao carregar imagem')); };
    img.src = url;
  });
}

/** Upload de imagem a partir de DataURL ou Blob — salva no Supabase Storage e retorna URL pública */
export async function uploadDataUrlOuBlobAsWebP(
  dataUrlOrBlob: string | Blob,
  empreendimentoId: string,
  fileNamePrefix = 'preview'
): Promise<string> {
  const supabase = getSupabase();
  let webpFile: File;
  if (typeof dataUrlOrBlob === 'string') {
    const res = await fetch(dataUrlOrBlob);
    const blob = await res.blob();
    webpFile = new File([blob], `${empreendimentoId}_${fileNamePrefix}.webp`, { type: 'image/webp' });
  } else {
    webpFile = new File([dataUrlOrBlob], `${empreendimentoId}_${fileNamePrefix}.webp`, { type: 'image/webp' });
  }

  const nome = `${empreendimentoId}_${Date.now()}_${fileNamePrefix}.webp`;
  if (supabase) {
    try {
      const { error } = await supabase.storage.from(BUCKET).upload(nome, webpFile, {
        contentType: 'image/webp',
        upsert: true,
      });
      if (!error) {
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
        return data.publicUrl;
      }
    } catch (e) {
      console.warn('[storage] Upload preview falhou:', e);
    }
  }
  return typeof dataUrlOrBlob === 'string' ? dataUrlOrBlob : URL.createObjectURL(dataUrlOrBlob);
}

/** Upload de PDF — armazena binário se Supabase configurado, ou retorna base64. */
export async function uploadMapaPDF(
  file: File,
  empreendimentoId: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  onProgress?.(10);
  const nome = `${empreendimentoId}_${Date.now()}.pdf`;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(nome, file, { contentType: 'application/pdf', upsert: true });

      if (!error) {
        onProgress?.(90);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nome);
        onProgress?.(100);
        return data.publicUrl;
      }

      // Fallback com userId
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || 'shared';
      const nomeAlt = `${userId}/${nome}`;
      const { error: error2 } = await supabase.storage
        .from(BUCKET)
        .upload(nomeAlt, file, { contentType: 'application/pdf', upsert: true });

      if (!error2) {
        onProgress?.(90);
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(nomeAlt);
        onProgress?.(100);
        return data.publicUrl;
      }
      console.warn('[storage] Upload PDF falhou:', error2.message);
    } catch (err: any) {
      console.warn('[storage] Erro na comunicação com Supabase (PDF):', err?.message || err);
    }
  }

  // Último fallback: base64
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler PDF'));
    reader.readAsDataURL(file);
  });
}

/** Pré-cacheia a URL no Service Worker para acesso offline imediato. */
export function precacheMapaUrl(url: string) {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'PRECACHE_URL', url });
  }
}
