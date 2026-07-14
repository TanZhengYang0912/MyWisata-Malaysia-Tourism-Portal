import { Image as ImageIcon, Landmark, Utensils } from 'lucide-react';

interface Props { src?: string | null; alt: string; kind?: 'food' | 'experience' | 'outlet' | 'product'; size?: 'sm' | 'md' }

export default function CompactThumbnail({ src, alt, kind = 'product', size = 'sm' }: Props) {
  const Icon = kind === 'food' ? Utensils : kind === 'experience' || kind === 'outlet' ? Landmark : ImageIcon;
  const sizeClass = size === 'md' ? 'h-20 w-24' : 'h-14 w-14';
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-xl ${sizeClass} ${kind === 'food' ? 'bg-amber-50 text-amber-700' : 'bg-secondary text-primary'}`}>
      {src ? (
        <img src={src} alt={alt} className="h-full w-full object-cover" />
      ) : <div className="flex h-full w-full items-center justify-center"><Icon size={size === 'md' ? 24 : 19} /><span className="sr-only">{alt}</span></div>}
    </div>
  );
}
