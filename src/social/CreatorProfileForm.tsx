import React, { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import {
  parseCreatorProfile,
  type CreatorProfile,
} from '../creator-recipe';
import {
  loadCreatorProfile,
  saveCreatorProfile,
  DEFAULT_CREATOR_PROFILE,
  type ProfileStorageBackend,
  defaultIndexedDBBackend,
} from './profile-storage';

export interface CreatorProfileFormProps {
  initialProfile?: CreatorProfile;
  storageBackend?: ProfileStorageBackend;
  autoLoad?: boolean;
  onSave?: (savedProfile: CreatorProfile) => void;
  onCancel?: () => void;
}

export function CreatorProfileForm({
  initialProfile,
  storageBackend = defaultIndexedDBBackend,
  autoLoad = true,
  onSave,
  onCancel,
}: CreatorProfileFormProps) {
  const [profile, setProfile] = useState<CreatorProfile>(
    initialProfile ?? DEFAULT_CREATOR_PROFILE,
  );
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Auto-load on mount
  useEffect(() => {
    if (!autoLoad) return;
    let isCancelled = false;

    async function load() {
      const res = await loadCreatorProfile(storageBackend);
      if (isCancelled) return;
      if (res.ok && res.data) {
        setProfile(res.data);
      } else if (!res.ok) {
        // Storage error or corrupted data: report as message
        setStatusMessage(`Kayıtlı profil yüklenemedi: ${res.error}`);
      }
    }
    load();

    return () => {
      isCancelled = true;
    };
  }, [autoLoad, storageBackend]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatusMessage(null);

    // Validate using canonical parser
    let validated: CreatorProfile;
    try {
      validated = parseCreatorProfile(profile);
    } catch (err) {
      setError((err as Error).message);
      return;
    }

    setIsSaving(true);
    try {
      const res = await saveCreatorProfile(validated, storageBackend);
      if (res.ok) {
        setStatusMessage('Kanal profili başarıyla kaydedildi.');
        onSave?.(res.data);
      } else {
        setError(`Profil kaydedilemedi: ${res.error}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setProfile(DEFAULT_CREATOR_PROFILE);
    setError(null);
    setStatusMessage('Varsayılan profil ayarlarına dönüldü.');
  };

  return (
    <form className="creator-profile-form" onSubmit={handleSubmit} noValidate>
      <div className="creator-profile-form-header">
        <h3>Kanal ve İçerik Profili (CreatorProfile)</h3>
        <p className="creator-profile-subtitle">
          Bu tercihler cihazınızda güvenle saklanır. Her kayıtta yeniden ayar girmeniz gerekmez.
          Hiçbir şifre veya OAuth kimliği profilde tutulmaz.
        </p>
      </div>

      {error && (
        <div className="creator-profile-alert error" role="alert">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {statusMessage && (
        <div className="creator-profile-alert success" role="status">
          <CheckCircle2 size={16} />
          <span>{statusMessage}</span>
        </div>
      )}

      <div className="creator-profile-grid">
        {/* Kanal / Profil Adı */}
        <div className="creator-field-group">
          <label htmlFor="profile-name">Kanal / Profil Adı:</label>
          <input
            id="profile-name"
            type="text"
            required
            maxLength={100}
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            placeholder="örn. Ana Oyun Kanalı"
          />
        </div>

        {/* Dil Kodu */}
        <div className="creator-field-group">
          <label htmlFor="profile-language">İçerik Dili (ISO Kodu):</label>
          <input
            id="profile-language"
            type="text"
            required
            maxLength={35}
            value={profile.language}
            onChange={(e) => setProfile({ ...profile, language: e.target.value })}
            placeholder="örn. tr, en, de, pt-BR"
          />
          <small className="field-hint">Standart IETF dil etiketi (örn. "tr", "en", "es").</small>
        </div>

        {/* Oyun / Kategori */}
        <div className="creator-field-group">
          <label htmlFor="profile-game">Oyun / Kategori:</label>
          <input
            id="profile-game"
            type="text"
            required
            maxLength={200}
            value={profile.game}
            onChange={(e) => setProfile({ ...profile, game: e.target.value })}
            placeholder="örn. Cyberpunk 2077, Valorant, Genel"
          />
        </div>

        {/* Hedef Kitle */}
        <div className="creator-field-group">
          <label htmlFor="profile-audience">Hedef Kitle Açıklaması:</label>
          <input
            id="profile-audience"
            type="text"
            required
            maxLength={500}
            value={profile.audience}
            onChange={(e) => setProfile({ ...profile, audience: e.target.value })}
            placeholder="örn. Türkçe oyun ve rehber takipçileri"
          />
        </div>

        {/* Ses & Yorum Tarzı */}
        <div className="creator-field-group">
          <label htmlFor="profile-commentary">Yorum & Ses Tarzı (Commentary):</label>
          <select
            id="profile-commentary"
            value={profile.commentary}
            onChange={(e) =>
              setProfile({
                ...profile,
                commentary: e.target.value as CreatorProfile['commentary'],
              })
            }
          >
            <option value="unspecified">Belirtilmemiş (Unspecified)</option>
            <option value="spoken">Konuşma / Mikrofon Ağırlıklı (Spoken)</option>
            <option value="game-audio">Oyun Sesi Ağırlıklı (Game Audio)</option>
            <option value="mixed">Karma (Mixed Audio)</option>
          </select>
        </div>

        {/* Kadraj Doldurma Modu */}
        <div className="creator-field-group">
          <label htmlFor="profile-fillmode">Kadraj Doldurma Modu (Fill Mode):</label>
          <select
            id="profile-fillmode"
            value={profile.fillMode}
            onChange={(e) =>
              setProfile({
                ...profile,
                fillMode: e.target.value as CreatorProfile['fillMode'],
              })
            }
          >
            <option value="blur-background">Bulanık Kenarlık (Blur Background)</option>
            <option value="fit">Sığdır / Letterbox (Fit)</option>
            <option value="crop">Kırp / Doldur (Crop)</option>
          </select>
        </div>

        {/* Uzun Video Hedef Süresi (sn) */}
        <div className="creator-field-group">
          <label htmlFor="profile-long-target">Uzun Video Hedef Süresi (sn):</label>
          <input
            id="profile-long-target"
            type="number"
            min={1}
            max={86400}
            value={Number.isNaN(profile.longTargetSeconds) ? '' : profile.longTargetSeconds}
            onChange={(e) =>
              setProfile({
                ...profile,
                longTargetSeconds: e.target.value === '' ? NaN : Number(e.target.value),
              })
            }
          />
        </div>

        {/* Short Hedef Süresi (sn) */}
        <div className="creator-field-group">
          <label htmlFor="profile-short-target">Short Hedef Süresi (sn, maks 180):</label>
          <input
            id="profile-short-target"
            type="number"
            min={1}
            max={180}
            value={Number.isNaN(profile.shortTargetSeconds) ? '' : profile.shortTargetSeconds}
            onChange={(e) =>
              setProfile({
                ...profile,
                shortTargetSeconds: e.target.value === '' ? NaN : Number(e.target.value),
              })
            }
          />
        </div>

        {/* Üretilecek Short Sayısı (0-12) */}
        <div className="creator-field-group">
          <label htmlFor="profile-short-count">Üretilecek Short Sayısı (0 - 12):</label>
          <input
            id="profile-short-count"
            type="number"
            min={0}
            max={12}
            value={Number.isNaN(profile.shortCount) ? '' : profile.shortCount}
            onChange={(e) =>
              setProfile({
                ...profile,
                shortCount: e.target.value === '' ? NaN : parseInt(e.target.value, 10),
              })
            }
          />
          <small className="field-hint">0 seçilirse sadece uzun format video üretilir.</small>
        </div>
      </div>

      <div className="creator-profile-form-footer">
        <button
          type="button"
          className="btn-secondary"
          onClick={handleReset}
          title="Ayarları varsayılana döndür"
        >
          <RotateCcw size={14} /> Sıfırla
        </button>

        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            İptal
          </button>
        )}

        <button type="submit" className="btn-primary" disabled={isSaving}>
          <Save size={14} /> {isSaving ? 'Kaydediliyor...' : 'Profili Kaydet'}
        </button>
      </div>
    </form>
  );
}
