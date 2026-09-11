import { posterUrl, type PosterSize } from '../lib/images';

interface PosterProps {
  path: string | null;
  alt: string;
  size?: PosterSize;
}

export function Poster({ path, alt, size = 'w342' }: PosterProps) {
  const url = posterUrl(path, size);

  if (!url) {
    return (
      <div className="flex aspect-[2/3] w-full items-center justify-center rounded-lg bg-neutral-800 text-xs text-neutral-500">
        No artwork
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="aspect-[2/3] w-full rounded-lg bg-neutral-800 object-cover"
    />
  );
}
