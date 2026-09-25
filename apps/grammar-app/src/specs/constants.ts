export const links = {
  // Offline fallback: the committed HuBMAP package under sample-data/, synced
  // to public/data by `pnpm sync-data`. Kept fresh from the portal; the old
  // hubmap_examples/ TSVs were an unmaintained 2024 snapshot and are gone.
  // donors: './data/hubmap/donors.tsv',
  // datasets: './data/hubmap/datasets.tsv',
  // samples: './data/hubmap/samples.tsv',
  donors: 'https://portal.hubmapconsortium.org/metadata/v0/udi/donors.tsv',
  datasets: 'https://portal.hubmapconsortium.org/metadata/v0/udi/datasets.tsv',
  samples: 'https://portal.hubmapconsortium.org/metadata/v0/udi/samples.tsv',
};

export const thumbnails = {
  donors: {
    table: './data/hubmap_examples/thumbnails/donors/table.png',
    visual_table: './data/hubmap_examples/thumbnails/donors/visual-table.png',
    by_sex: './data/hubmap_examples/thumbnails/donors/by-sex.png',
    by_race_and_sex:
      './data/hubmap_examples/thumbnails/donors/by-race-and-sex.png',
    by_age_and_sex:
      './data/hubmap_examples/thumbnails/donors/by-age-and-sex.png',
  },
  samples: {
    by_organ: './data/hubmap_examples/thumbnails/samples/by-organ.png',
  },
  datasets: {
    by_organ: './data/hubmap_examples/thumbnails/datasets/by-organ.png',
    by_assay_and_organ_bar:
      './data/hubmap_examples/thumbnails/datasets/by-assay-and-organ-bar.png',
    by_assay_and_organ_heatmap:
      './data/hubmap_examples/thumbnails/datasets/by-assay-and-organ-heatmap.png',
  },
};
