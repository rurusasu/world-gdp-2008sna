export interface Point {
  year: number;
  value: number | null;
  index: number | null;
  growth: number | null;
  notes: string;
}

interface Series {
  id: string;
  first: number;
  last: number;
  index_base: number;
  currency: string;
  points: Point[];
}

export interface CountrySeries extends Series {
  kind: 'real';
  country_code: string;
  country: string;
  table: string;
  series_number: string;
  base_year: string;
  fiscal_year_type: string;
  preferred: boolean;
  price_basis_verified: boolean;
}

interface Panel extends Series {
  kind: 'panel';
  label: string;
  country_count: number;
  benchmark_year: number;
  excluded_countries: string[];
  members: {
    country: string;
    weight_share: number;
    series_id: string;
    fx: { source_note: string };
  }[];
}

interface Reference extends Series {
  kind: 'reference';
  label: string;
}

export type DisplaySeries = CountrySeries | Panel | Reference;

export interface GDPSourceFile {
  group: string;
  verified_rows: number;
}

export interface Report {
  summary: {
    real_first: number;
    real_last: number;
    real_countries: number;
    real_series: number;
  };
  source_manifest: {
    retrieved_at: string;
    files: (GDPSourceFile | { group?: never })[];
  };
  series: CountrySeries[];
  panels: Panel[];
  reference: Reference | null;
  default_panel: string | null;
}

export interface Country {
  code: string;
  name: string;
  first: number;
  last: number;
  count: number;
}
