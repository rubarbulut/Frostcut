import { useId, useState, useMemo, type ElementType } from 'react';
import {
  Smartphone,
  Scissors,
  Layers,
  Bookmark,
  MessageSquare,
  Sparkles,
  Clapperboard,
  Brain,
  Share2,
  TrendingUp,
  BarChart3,
  Zap,
  Search,
  Wand2,
  X,
  Flame,
} from 'lucide-react';
import { Modal } from './components';
import { AutoReframe } from './AutoReframe';
import { SubtitleTools } from './SubtitleTools';
import { PublishTools } from './PublishTools';
import { BrollTools } from './BrollTools';
import { DiscoverTools } from './DiscoverTools';
import { BatchExport } from './BatchExport';
import { EqualParts } from './EqualParts';
import { SequenceTools } from './SequenceTools';
import { BrandKitTools } from './BrandKitTools';
import { ChapterTools } from './ChapterTools';
import { StyleMemoryTools } from './StyleMemoryTools';
import { AnalyticsTools } from './AnalyticsTools';

export interface CreatorToolDef {
  id: string;
  name: string;
  category: 'cut' | 'style' | 'publish';
  categoryLabel: string;
  subtitle: string;
  badge?: string;
  badgeColor?: string;
  icon: ElementType;
  accent: string;
  proTip: string;
}

export const CREATOR_TOOLS_CATALOG: CreatorToolDef[] = [
  // 1. Kurgu & Format (Viral Cut & Formatting)
  {
    id: 'Reframe',
    name: 'Auto Reframe',
    category: 'cut',
    categoryLabel: 'Viral Kurgu & Format',
    subtitle: '9:16 Shorts, Reels & TikTok',
    badge: 'AI VIRAL',
    badgeColor: '#38bdf8',
    icon: Smartphone,
    accent: '#38bdf8',
    proTip:
      'Yatay oynanış kaydınızı akıllı yüz ve hareket takibiyle anında dikey formata dönüştürün; ana aksiyonu asla kadraj dışına kaçırmayın.',
  },
  {
    id: 'Split',
    name: 'Equal Parts Splitter',
    category: 'cut',
    categoryLabel: 'Viral Kurgu & Format',
    subtitle: 'Bölüm 1, 2... Seri Kesimi',
    badge: 'SERIES',
    badgeColor: '#60a5fa',
    icon: Scissors,
    accent: '#60a5fa',
    proTip:
      'Uzun oyun oturumlarını 60 saniyelik veya eşit parçalara bölerek izleyicileri sonraki bölüme bağlayan mini video serileri oluşturun.',
  },
  {
    id: 'Parts',
    name: 'Sequence Manager',
    category: 'cut',
    categoryLabel: 'Viral Kurgu & Format',
    subtitle: 'Çoklu Sekans & Bölüm Akışı',
    icon: Layers,
    accent: '#34d399',
    proTip:
      'Farklı kamera açıları, alt sekanslar ve kurgu bloklarını timeline üzerinde karmaşa olmadan bağımsız yönetin.',
  },
  {
    id: 'Chapters',
    name: 'Video Chapters',
    category: 'cut',
    categoryLabel: 'Viral Kurgu & Format',
    subtitle: 'YouTube Zaman Damgaları',
    icon: Bookmark,
    accent: '#22d3ee',
    proTip:
      'Videonun kilit anlarına zaman damgaları ekleyin; Google arama sonuçlarında (SEO) ve YouTube oynatıcısında bölümlerle öne çıkın.',
  },

  // 2. Görsel & Marka (Styling & Brand Assets)
  {
    id: 'Subtitles',
    name: 'Captions & Subtitles',
    category: 'style',
    categoryLabel: 'Görsel & Marka Stili',
    subtitle: 'Viral Dinamik Altyazılar',
    badge: 'HOT',
    badgeColor: '#f43f5e',
    icon: MessageSquare,
    accent: '#f43f5e',
    proTip:
      'Videoların %80\'i mobilde sessiz izlenir. Dinamik renkli ve kelime vurgulu altyazılarla izleyici tutma (retention) oranınızı zirveye taşıyın.',
  },
  {
    id: 'Brand kit',
    name: 'Creator Brand Kit',
    category: 'style',
    categoryLabel: 'Görsel & Marka Stili',
    subtitle: 'Font, Renk & Filigran',
    icon: Sparkles,
    accent: '#fbbf24',
    proTip:
      'Kanalınızın renk paletini, imza fontunu ve filigranını kaydederek tüm içeriklerinizde anında tanınan bir marka kimliği yaratın.',
  },
  {
    id: 'B-roll',
    name: 'AI B-Roll Inserts',
    category: 'style',
    categoryLabel: 'Görsel & Marka Stili',
    subtitle: 'Bağlamsal Stok Kesitler',
    badge: 'AI',
    badgeColor: '#c084fc',
    icon: Clapperboard,
    accent: '#c084fc',
    proTip:
      'Konuşma anlarındaki durağanlığı kırmak için içeriğinizle doğrudan ilişkili stok görüntüleri ve B-Roll katmanlarını tek tıkla yerleştirin.',
  },
  {
    id: 'Style memory',
    name: 'Smart Style Memory',
    category: 'style',
    categoryLabel: 'Görsel & Marka Stili',
    subtitle: 'Akıllı Alışkanlık Hafızası',
    icon: Brain,
    accent: '#a78bfa',
    proTip:
      'Kurgu yaptıkça stilinizi öğrenen AI hafızası sayesinde her yeni projede sevdiğiniz geçiş ve altyazı ayarları otomatik hatırlanır.',
  },

  // 3. Yayın & Büyüme (Distribution & Growth)
  {
    id: 'Publish',
    name: 'Publish & Metadata',
    category: 'publish',
    categoryLabel: 'Yayın & Büyüme',
    subtitle: 'YouTube, TikTok & Reels',
    badge: 'AUTO',
    badgeColor: '#ef4444',
    icon: Share2,
    accent: '#ef4444',
    proTip:
      'Videonuzun başlık, açıklama ve etiketlerini platform sınırlarına uygun biçimde hazırlayın; yayın paketini tek tıkla kopyalayın.',
  },
  {
    id: 'Discover',
    name: 'Trends & Viral SEO',
    category: 'publish',
    categoryLabel: 'Yayın & Büyüme',
    subtitle: 'Trend Konu & Müzik Analizi',
    badge: 'TREND',
    badgeColor: '#10b981',
    icon: TrendingUp,
    accent: '#10b981',
    proTip:
      'Nişinizdeki trend aramaları ve popüler müzik aralıklarını inceleyerek algoritmanın öne çıkaracağı anahtar kelimelerle yayınlayın.',
  },
  {
    id: 'Analytics',
    name: 'Audience Retention',
    category: 'publish',
    categoryLabel: 'Yayın & Büyüme',
    subtitle: 'İzlenme & Etkileşim Grafiği',
    icon: BarChart3,
    accent: '#818cf8',
    proTip:
      'Videonun tempo düşüşlerini ve izleyici kaybı olabilecek sessizlik noktalarını tespit ederek kurgunuzun akıcılığını maksimize edin.',
  },
  {
    id: 'Batch export',
    name: 'Batch Multi-Export',
    category: 'publish',
    categoryLabel: 'Yayın & Büyüme',
    subtitle: 'Toplu & Çoklu Format Render',
    badge: 'FAST',
    badgeColor: '#f59e0b',
    icon: Zap,
    accent: '#f59e0b',
    proTip:
      'Hem ana YouTube 16:9 videonuzu hem de 9:16 Shorts sürümlerinizi aynı anda arka planda sıraya alıp tek seferde export edin.',
  },
];

export default function CreatorTools({
  onClose,
  initialTab = 'Reframe',
}: {
  onClose: () => void;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const tabId = useId();

  const activeTool = useMemo(
    () => CREATOR_TOOLS_CATALOG.find((t) => t.id === tab) ?? CREATOR_TOOLS_CATALOG[0],
    [tab],
  );

  const filteredTools = useMemo(() => {
    if (!searchQuery.trim()) return CREATOR_TOOLS_CATALOG;
    const q = searchQuery.toLowerCase();
    return CREATOR_TOOLS_CATALOG.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.subtitle.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  const categories = useMemo(() => {
    const map = new Map<string, { label: string; tools: CreatorToolDef[] }>();
    for (const tool of filteredTools) {
      if (!map.has(tool.category)) {
        map.set(tool.category, { label: tool.categoryLabel, tools: [] });
      }
      map.get(tool.category)!.tools.push(tool);
    }
    return Array.from(map.values());
  }, [filteredTools]);

  const ActiveIcon = activeTool.icon;

  const handleKeyDown = (e: React.KeyboardEvent, index: number, total: number) => {
    let next = -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      next = (index + 1) % total;
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      next = (index + total - 1) % total;
    } else if (e.key === 'Home') {
      next = 0;
    } else if (e.key === 'End') {
      next = total - 1;
    }
    if (next >= 0 && filteredTools[next]) {
      e.preventDefault();
      e.stopPropagation();
      setTab(filteredTools[next].id);
    }
  };

  return (
    <Modal title="Creator Studio" onClose={onClose} wide className="creator-studio-dialog">
      {/* Studio Luxury Topbar */}
      <div className="creator-studio-topbar">
        <div className="creator-studio-brand">
          <div className="creator-studio-brand-icon">
            <Wand2 size={18} color="#38bdf8" />
          </div>
          <div>
            <div className="creator-studio-brand-title">
              <span>Creator Studio Pro</span>
              <span className="creator-studio-pill">SUITE</span>
            </div>
            <div className="creator-studio-brand-subtitle">
              Viral Kurgu, Biçimlendirme & Yayınlama Paketi
            </div>
          </div>
        </div>
        <button
          className="creator-studio-close-btn"
          onClick={onClose}
          aria-label="Close Creator Tools"
          title="Kapat (Esc)"
        >
          <X size={18} />
        </button>
      </div>

      {/* Two-Column Studio Body */}
      <div className="creator-studio-layout">
        {/* Left Column: Navigation Sidebar */}
        <aside className="creator-studio-sidebar">
          <div className="creator-studio-search-box">
            <Search size={14} className="creator-studio-search-icon" />
            <input
              type="text"
              placeholder="Ara... (örn. altyazı, reframe)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="creator-studio-search-input"
            />
            {searchQuery && (
              <button
                className="creator-studio-search-clear"
                onClick={() => setSearchQuery('')}
                title="Temizle"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div
            className="creator-studio-nav"
            role="tablist"
            aria-label="Creator Studio araçları"
          >
            {categories.map((cat) => (
              <div key={cat.label} className="creator-studio-category">
                <div className="creator-studio-category-label">{cat.label}</div>
                {cat.tools.map((item) => {
                  const Icon = item.icon;
                  const isSelected = tab === item.id;
                  const itemIndex = filteredTools.indexOf(item);
                  return (
                    <button
                      key={item.id}
                      role="tab"
                      id={`${tabId}-${item.id}`}
                      aria-controls={`${tabId}-panel`}
                      aria-selected={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                      className="creator-studio-tab-btn"
                      onClick={() => setTab(item.id)}
                      onKeyDown={(e) => handleKeyDown(e, itemIndex, filteredTools.length)}
                    >
                      <div
                        className="creator-studio-tab-icon"
                        style={{
                          color: isSelected ? item.accent : '#94a3b8',
                          background: isSelected ? `${item.accent}22` : 'rgba(255, 255, 255, 0.04)',
                        }}
                      >
                        <Icon size={16} />
                      </div>
                      <div className="creator-studio-tab-text">
                        <span className="creator-studio-tab-title">{item.name}</span>
                        <span className="creator-studio-tab-sub">{item.subtitle}</span>
                      </div>
                      {item.badge && (
                        <span
                          className="creator-studio-tab-badge"
                          style={{
                            color: item.badgeColor ?? item.accent,
                            borderColor: `${item.badgeColor ?? item.accent}55`,
                            backgroundColor: `${item.badgeColor ?? item.accent}15`,
                          }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Right Column: Studio Canvas */}
        <main
          className="creator-studio-content"
          role="tabpanel"
          id={`${tabId}-panel`}
          aria-labelledby={`${tabId}-${tab}`}
          tabIndex={0}
        >
          {/* Active Tool Hero Banner */}
          <div
            className="creator-studio-hero-banner"
            style={{
              borderColor: `${activeTool.accent}33`,
              ['--hero-accent' as any]: activeTool.accent,
            }}
          >
            <div className="creator-studio-hero-header">
              <div
                className="creator-studio-hero-icon"
                style={{
                  background: `${activeTool.accent}1a`,
                  color: activeTool.accent,
                  borderColor: `${activeTool.accent}44`,
                }}
              >
                <ActiveIcon size={24} />
              </div>
              <div className="creator-studio-hero-info">
                <div className="creator-studio-hero-title-row">
                  <h2>{activeTool.name}</h2>
                  {activeTool.badge && (
                    <span
                      className="creator-studio-hero-badge"
                      style={{
                        backgroundColor: `${activeTool.badgeColor ?? activeTool.accent}22`,
                        color: activeTool.badgeColor ?? activeTool.accent,
                        borderColor: `${activeTool.badgeColor ?? activeTool.accent}44`,
                      }}
                    >
                      {activeTool.badge}
                    </span>
                  )}
                </div>
                <p className="creator-studio-hero-desc">{activeTool.subtitle}</p>
              </div>
            </div>

            <div className="creator-studio-tip-card">
              <Flame size={15} className="creator-studio-tip-icon" />
              <div className="creator-studio-tip-text">
                <b>Creator Tavsiyesi:</b> {activeTool.proTip}
              </div>
            </div>
          </div>

          {/* Active Tool Content */}
          <div className="creator-studio-tool-body">
            {tab === 'Split' && <EqualParts onCreated={onClose} />}
            {tab === 'Parts' && <SequenceTools />}
            {tab === 'Reframe' && <AutoReframe />}
            {tab === 'Subtitles' && <SubtitleTools />}
            {tab === 'Brand kit' && <BrandKitTools />}
            {tab === 'Style memory' && <StyleMemoryTools />}
            {tab === 'Analytics' && <AnalyticsTools />}
            {tab === 'Chapters' && <ChapterTools onNavigate={onClose} />}
            {tab === 'B-roll' && <BrollTools />}
            {tab === 'Publish' && <PublishTools />}
            {tab === 'Discover' && <DiscoverTools />}
            {tab === 'Batch export' && <BatchExport />}
          </div>
        </main>
      </div>
    </Modal>
  );
}
