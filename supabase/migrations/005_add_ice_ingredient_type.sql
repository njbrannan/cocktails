-- Allow "ice" as a first-class ingredient type.
-- Safe to run multiple times.

alter table ingredients drop constraint if exists ingredients_type_check;

alter table ingredients
  add constraint ingredients_type_check
  check (type in ('liquor', 'mixer', 'juice', 'syrup', 'garnish', 'ice'));

