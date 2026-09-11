import { useRegions } from '../api/queries';
import { useRegion } from './useRegion';

export function RegionPicker() {
  const { data: regions, isPending } = useRegions();
  const { region, setRegion } = useRegion();

  return (
    <label className="flex items-center gap-2 text-sm text-neutral-400">
      <span>Region</span>
      <select
        value={region}
        disabled={isPending}
        onChange={(event) => setRegion(event.target.value)}
        className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-neutral-100"
      >
        {(regions ?? [{ iso_3166_1: region, english_name: region, native_name: region }]).map(
          (item) => (
            <option key={item.iso_3166_1} value={item.iso_3166_1}>
              {item.english_name}
            </option>
          ),
        )}
      </select>
    </label>
  );
}
