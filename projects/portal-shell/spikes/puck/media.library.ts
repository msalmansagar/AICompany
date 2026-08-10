/**
 * Media library.
 *
 * Components store an ASSET ID, never a raw CSS value. That indirection is the
 * whole point:
 *
 *   - an editor picks from a gallery instead of typing `linear-gradient(...)`
 *   - swapping a placeholder gradient for a real photograph is a change to
 *     THIS file, not to every stored page
 *   - a missing asset is detectable, because the id no longer resolves
 *
 * In production this list is fetched from Dataverse (a media library table)
 * and `value` becomes `url(...)`. The shape does not change.
 */

export type MediaKind = 'gradient' | 'image';

export interface MediaAsset {
  id: string;
  labelEn: string;
  labelAr: string;
  kind: MediaKind;
  /** Any valid CSS `background` value. */
  value: string;
}

export const MEDIA_LIBRARY: MediaAsset[] = [
  {
    id: 'tech-ai',
    labelEn: 'AI / technology',
    labelAr: 'الذكاء الاصطناعي',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#0b1a2b 0%,#12304d 45%,#1b4f6b 100%)',
  },
  {
    id: 'meeting-warm',
    labelEn: 'Business meeting',
    labelAr: 'اجتماع عمل',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#b08d5f 0%,#d9c3a0 50%,#8f6f4a 100%)',
  },
  {
    id: 'security',
    labelEn: 'Security / compliance',
    labelAr: 'الأمن والامتثال',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#081527 0%,#0f3350 50%,#1c6b8f 100%)',
  },
  {
    id: 'academy',
    labelEn: 'Academy / learning',
    labelAr: 'التعلّم',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#efe7d8 0%,#e2d5c0 55%,#cbb99b 100%)',
  },
  {
    id: 'legal',
    labelEn: 'Legal services',
    labelAr: 'الخدمات القانونية',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#cbb9a4 0%,#e6dccd 100%)',
  },
  {
    id: 'certification',
    labelEn: 'Certification',
    labelAr: 'الشهادات',
    kind: 'gradient',
    value: 'linear-gradient(135deg,#dfe6ec 0%,#f2f5f8 100%)',
  },
  {
    id: 'advisory-dark',
    labelEn: 'Advisory (dark overlay)',
    labelAr: 'استشارات (تعتيم)',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(10,28,45,0.62),rgba(10,28,45,0.62)), linear-gradient(135deg,#20415c 0%,#3b6d8c 60%,#5b93ad 100%)',
  },
  {
    id: 'rail-slate',
    labelEn: 'Service card — slate',
    labelAr: 'بطاقة خدمة — رمادي',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#5b6b7a,#8d9aa6)',
  },
  {
    id: 'rail-bronze',
    labelEn: 'Service card — bronze',
    labelAr: 'بطاقة خدمة — برونزي',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#8a6a3f,#c2a274)',
  },
  {
    id: 'rail-navy',
    labelEn: 'Service card — navy',
    labelAr: 'بطاقة خدمة — كحلي',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(20,34,48,.6),rgba(20,34,48,.6)), linear-gradient(135deg,#2a3f55,#4f6f8c)',
  },
  {
    id: 'rail-steel',
    labelEn: 'Service card — steel',
    labelAr: 'بطاقة خدمة — فولاذي',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#6b7f8f,#a8bac6)',
  },
  {
    id: 'rail-teal',
    labelEn: 'Service card — teal',
    labelAr: 'بطاقة خدمة — أزرق مخضر',
    kind: 'gradient',
    value:
      'linear-gradient(rgba(20,34,48,.55),rgba(20,34,48,.55)), linear-gradient(135deg,#4a6270,#7d95a3)',
  },
];

const BY_ID = new Map(MEDIA_LIBRARY.map((asset) => [asset.id, asset]));

/**
 * Resolves an asset id to a CSS background value.
 *
 * Returns a visible diagonal-stripe pattern for an unknown id rather than
 * nothing, so a broken reference shows up on the page instead of rendering as
 * an empty box that looks intentional.
 */
export function resolveMedia(id: string | undefined): string {
  if (!id) return 'transparent';
  const asset = BY_ID.get(id);
  if (asset) return asset.value;
  return 'repeating-linear-gradient(45deg,#f3d6d6 0 8px,#e9bdbd 8px 16px)';
}

export function findMedia(id: string | undefined): MediaAsset | undefined {
  return id ? BY_ID.get(id) : undefined;
}
