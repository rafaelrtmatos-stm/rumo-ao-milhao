# Guia de Uso - Mapa Interativo Corrigido

## 📋 Resumo das Correções

Este novo sistema de mapa interativo resolve todos os 8 problemas identificados:

### ✅ 1. Renderização Corrigida
- Recalcula tamanho em: `resize`, `orientationchange`, `fullscreenchange`, `zoom`
- Usa `requestAnimationFrame` para performance
- Mantém aspect ratio original

### ✅ 2. Splash Screen com Logo
- Logo transparente sem fundo branco
- Efeito fade suave
- Desaparece após mapa carregar
- Customizável (duração, título)

### ✅ 3. Escala de Marcadores
- Bolinhas acompanham EXATAMENTE o zoom
- Cálculo baseado em: `baseMarkerSize * scale * zoom`
- Recalcula em tempo real
- Sem distorção

### ✅ 4. Botões Compactos
- Apenas ícones (lucide-react)
- Floating buttons no canto superior direito
- Layout tipo Google Maps
- Responsivos

### ✅ 5. Zoom Fluido
- Usa `transform: scale()` para performance
- `requestAnimationFrame` suave
- Sem travamentos
- Suporta mouse wheel

### ✅ 6. Exportação PNG Alta Qualidade
- Resolução 4x (ultra alta)
- Bolinhas mantêm alinhamento
- Incluir data no nome do arquivo

### ✅ 7. Exportação PDF Profissional
- PDF A4 landscape
- Título customizável
- Rodapé com data
- Pronto para impressão

### ✅ 8. Comportamento Professional
- Interface semelhante Google Maps
- Smooth interactions
- Loading indicator
- Sem micro-stutters

---

## 🚀 Como Usar

### Instalação
Os componentes já usam dependências do seu `package.json`:
- `lucide-react` ✅ (ícones)
- `html2canvas` ✅ (export de imagem)
- `jspdf` ✅ (export de PDF)

### Uso Básico

```tsx
import { InteractiveMap } from '@/components/InteractiveMap';

export function App() {
  const markers = [
    {
      id: 'lote-01',
      xPercent: 25,
      yPercent: 35,
      color: '#3B82F6',
      label: 'Lote 1',
    },
    {
      id: 'lote-02',
      xPercent: 50,
      yPercent: 50,
      color: '#EF4444',
      label: 'Lote 2',
    },
  ];

  return (
    <InteractiveMap
      mapImageUrl="/path/to/map.png"
      logoUrl="/path/to/logo.png"
      markers={markers}
      title="Rumo ao Milhão"
      baseMarkerSize={24}
      onMarkerClick={(markerId) => {
        console.log('Clicou no marcador:', markerId);
      }}
    />
  );
}
```

### Props do InteractiveMap

```typescript
interface InteractiveMapProps {
  mapImageUrl: string;           // URL da imagem do mapa
  logoUrl: string;               // URL da logo (PNG transparente)
  markers: MapMarker[];          // Array de marcadores
  title?: string;                // Título (padrão: 'Mapa Interativo')
  onMarkerClick?: (id: string) => void;  // Callback ao clicar marcador
  baseMarkerSize?: number;       // Tamanho base do marcador em px (padrão: 24)
}

interface MapMarker {
  id: string;                    // ID único
  xPercent: number;              // Posição X em % (0-100)
  yPercent: number;              // Posição Y em % (0-100)
  color?: string;                // Cor do marcador (hex/rgb)
  label?: string;                // Rótulo do marcador
}
```

---

## 🎨 Customização

### Cores dos Marcadores
```tsx
{
  id: 'lote-premium',
  xPercent: 50,
  yPercent: 50,
  color: '#FFD700',        // Ouro
  label: 'Lote Premium',
}
```

### Tamanho dos Marcadores
```tsx
<InteractiveMap
  baseMarkerSize={32}      // Maior
  // ou
  baseMarkerSize={16}      // Menor
/>
```

### Duração do Splash Screen
Edite em `SplashScreen.tsx`:
```tsx
duration={3000}  // 3 segundos em vez de 2
```

---

## 🔧 Arquitetura

### `useMapScaling.ts`
- Hook que gerencia toda a lógica de escala e zoom
- Calcula proporção imagem/renderizada
- Fornece tamanhos corretos de marcadores

### `MapControls.tsx`
- Componente dos botões (ícones pequenos)
- Floating buttons no topo direito
- Responsivo

### `Marker.tsx`
- Componente de marcador com escala dinâmica
- Suporte para rótulos
- Efeito hover/ativo
- Função auxiliar para desenho em canvas

### `SplashScreen.tsx`
- Logo com fundo transparente
- Animações suaves (fade in, scale)
- Customizável

### `ExportUtils.ts`
- `exportMapAsImage()` - PNG 4x resolução
- `exportMapAsPDF()` - PDF profissional
- Funções utilitárias para canvas

### `InteractiveMap.tsx`
- Componente principal que orquestra tudo
- Gerencia fullscreen
- Coordena exports
- Responsivo

---

## 📱 Responsividade

O componente é totalmente responsivo:

```css
/* Desktop */
height: 600px;

/* Mobile (<768px) */
height: 400px;

/* Fullscreen */
height: 100vh;
```

---

## 🎯 Eventos

### Clique em Marcador
```tsx
<InteractiveMap
  onMarkerClick={(markerId) => {
    // markerId = 'lote-01'
    // Abrir modal, scrollar, etc.
  }}
/>
```

---

## 🖼️ Exportações

### PNG
- Resolução: 4x (ultra alta)
- Formato: `mapa_empreendimento_2026-05-22.png`
- Bolinhas incluídas com alinhamento correto

### PDF
- Formato: A4 landscape
- Inclui: título, imagem, data
- Pronto para impressão
- Formato: `mapa_empreendimento_2026-05-22.pdf`

---

## ⚡ Performance

- **Transform Scale**: CPU eficiente, sem redraw
- **RequestAnimationFrame**: Sincronizado com refresh do monitor
- **Debounce**: Eventos otimizados
- **Lazy Loading**: Logo e imagem carregam sob demanda

---

## 🐛 Troubleshooting

### Mapa não renderiza
✅ Verifique se `mapImageUrl` é válido e acessível
✅ Confira CORS se for URL externa
✅ Inspecione console para erros

### Bolinhas desalinhadas
✅ Verifique `xPercent` e `yPercent` (0-100)
✅ Aumente `baseMarkerSize` se muito pequenos
✅ Confira escala de zoom em tempo real

### Export muito lento
✅ Reduza a escala em `ExportUtils.ts` (4 → 2)
✅ Reduza `pixelRatio` (2 → 1)

### Fullscreen não funciona
✅ Requer HTTPS ou localhost
✅ Verifique permissões do navegador
✅ Não funciona em iframes restringidos

---

## 📚 Exemplo Completo

```tsx
import { InteractiveMap } from '@/components/InteractiveMap';

export function EmpreendimentoPage() {
  const empreendimento = {
    nome: 'Rumo ao Milhão',
    lotes: [
      { id: 'lote-01', x: 20, y: 30, label: 'Lote 1', preco: 'R$ 250k' },
      { id: 'lote-02', x: 50, y: 50, label: 'Lote 2', preco: 'R$ 300k' },
      { id: 'lote-03', x: 80, y: 70, label: 'Lote 3', preco: 'R$ 280k' },
    ],
  };

  const markers = empreendimento.lotes.map(lote => ({
    id: lote.id,
    xPercent: lote.x,
    yPercent: lote.y,
    color: '#3B82F6',
    label: lote.label,
  }));

  return (
    <div>
      <h1>{empreendimento.nome}</h1>
      
      <InteractiveMap
        mapImageUrl="/maps/rumo-ao-milhao.png"
        logoUrl="/logos/rumo-ao-milhao-transparent.png"
        markers={markers}
        title={empreendimento.nome}
        baseMarkerSize={28}
        onMarkerClick={(markerId) => {
          const lote = empreendimento.lotes.find(l => l.id === markerId);
          console.log('Lote clicado:', lote);
          // Abrir modal com detalhes do lote
        }}
      />
    </div>
  );
}
```

---

## ✨ Próximos Passos

1. **Integrar dados reais**: conectar com API para carregar marcadores
2. **Adicionar filtros**: mostrar/ocultar tipos de lotes
3. **Info cards**: exibir detalhes ao clicar marcador
4. **Comparar lotes**: seleção múltipla
5. **Medições**: medir distâncias no mapa

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique o console do navegador (F12)
2. Confira URLs das imagens
3. Teste em navegador diferente
4. Verifique tamanho das imagens (não muito grandes)

