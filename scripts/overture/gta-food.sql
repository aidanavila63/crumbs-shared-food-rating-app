-- Round 79: food places in the Greater Toronto Area from Overture Maps, as a CSV for
-- public.overture_places. Run with DuckDB (free): duckdb < scripts/overture/gta-food.sql
-- Set the release below to the newest one listed at https://docs.overturemaps.org/release/latest/
-- NOT RUN YET: this workspace couldn't reach Overture's servers (Nov 18). Check the column names
-- against the release's schema before the first real run.
INSTALL spatial; LOAD spatial;
INSTALL httpfs; LOAD httpfs;
SET s3_region = 'us-west-2';

COPY (
  SELECT
    id,
    names.primary                                   AS name,
    names.common['fr']                              AS name_local,
    categories.primary                              AS category,
    ST_Y(geometry)                                  AS latitude,
    ST_X(geometry)                                  AS longitude,
    addresses[1].freeform                           AS address,
    addresses[1].locality                           AS city,
    addresses[1].postcode                           AS postcode,
    phones[1]                                       AS phone,
    websites[1]                                     AS website,
    brand.names.primary                             AS brand,
    confidence,
    '2026-11-13.0'                                  AS release
  FROM read_parquet('s3://overturemaps-us-west-2/release/2026-11-13.0/theme=places/type=place/*', hive_partitioning = 1)
  -- the GTA: Hamilton/Burlington to Oshawa, Lake Ontario to Newmarket
  WHERE bbox.xmin BETWEEN -80.10 AND -78.80
    AND bbox.ymin BETWEEN 43.30 AND 44.20
    AND confidence >= 0.6
    AND names.primary IS NOT NULL
    AND (
      categories.primary LIKE '%restaurant%'
      OR categories.primary IN ('cafe', 'coffee_shop', 'bakery', 'bar', 'pub', 'brewery', 'wine_bar',
                                'cocktail_bar', 'tea_room', 'bubble_tea', 'ice_cream_shop', 'dessert_shop',
                                'food_truck', 'food_court', 'deli', 'bagel_shop', 'donut_shop', 'juice_bar',
                                'fast_food_restaurant', 'diner', 'bistro', 'gastropub', 'buffet_restaurant')
    )
) TO 'overture-gta-food.csv' (HEADER, DELIMITER ',');
