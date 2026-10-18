import type { CountryChoice } from './country-series';

export function bindCountryFilter(
  root: HTMLElement,
  countries: CountryChoice[],
  onChange: (codes: Set<string>) => void,
): void {
  const search = root.querySelector<HTMLInputElement>('#country-filter-search');
  const list = root.querySelector<HTMLElement>('#country-filter-list');
  const count = root.querySelector<HTMLElement>('#country-filter-count');
  const clear = root.querySelector<HTMLButtonElement>('#country-filter-clear');
  if (!search || !list || !count || !clear) {
    throw new Error('国選択欄の必要な要素がありません');
  }

  const selected = new Set(countries.map((country) => country.code));
  const rows = new Map<
    string,
    { label: HTMLLabelElement; input: HTMLInputElement; name: string }
  >();
  const updateCount = () => {
    count.textContent = `${selected.size} / ${countries.length}か国・地域を選択中`;
  };
  const emit = () => onChange(new Set(selected));

  for (const country of countries) {
    const label = document.createElement('label');
    label.className = 'country-filter-option';
    label.dataset.countryName = country.name.toLocaleLowerCase('ja');
    label.title = `表${country.series.table} / 系列${country.series.series_number} / ${country.series.currency} / 基準年 ${country.series.base_year} / ${country.series.fiscal_year_type}（${country.series.first}–${country.series.last}年）`;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = country.code;
    input.checked = true;
    input.addEventListener('change', () => {
      if (input.checked) selected.add(country.code);
      else selected.delete(country.code);
      updateCount();
      emit();
    });

    const swatch = document.createElement('span');
    swatch.className = 'country-filter-swatch';
    swatch.style.backgroundColor = country.color;
    swatch.setAttribute('aria-hidden', 'true');

    const name = document.createElement('span');
    name.className = 'country-filter-name';
    name.textContent = country.name;

    label.append(input, swatch, name);
    list.append(label);
    rows.set(country.code, { label, input, name: country.name.toLocaleLowerCase('ja') });
  }

  search.addEventListener('input', () => {
    const query = search.value.trim().toLocaleLowerCase('ja');
    for (const { label, name } of rows.values()) label.hidden = !name.includes(query);
  });

  clear.addEventListener('click', () => {
    selected.clear();
    for (const { input } of rows.values()) input.checked = false;
    updateCount();
    emit();
  });

  updateCount();
  emit();
}
