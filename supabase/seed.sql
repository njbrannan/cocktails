insert into ingredients (name, type, bottle_size_ml)
values
  ('Vodka', 'liquor', 700),
  ('Gin', 'liquor', 700),
  ('Tequila Blanco', 'liquor', 700),
  ('Triple Sec', 'liquor', 700),
  ('Lime Juice', 'juice', null),
  ('Simple Syrup', 'syrup', null),
  ('Soda Water', 'mixer', null);

insert into recipes (name, description)
values
  ('Classic Margarita', 'Bright, citrus-forward margarita.'),
  ('Gin Fizz', 'Gin, citrus, and soda.');

insert into recipe_ingredients (recipe_id, ingredient_id, ml_per_serving)
select r.id, i.id,
  case
    when r.name = 'Classic Margarita' and i.name = 'Tequila Blanco' then 50
    when r.name = 'Classic Margarita' and i.name = 'Triple Sec' then 20
    when r.name = 'Classic Margarita' and i.name = 'Lime Juice' then 25
    when r.name = 'Classic Margarita' and i.name = 'Simple Syrup' then 15
    when r.name = 'Gin Fizz' and i.name = 'Gin' then 45
    when r.name = 'Gin Fizz' and i.name = 'Lime Juice' then 20
    when r.name = 'Gin Fizz' and i.name = 'Soda Water' then 90
    else 0
  end
from recipes r
cross join ingredients i
where
  (r.name = 'Classic Margarita' and i.name in ('Tequila Blanco', 'Triple Sec', 'Lime Juice', 'Simple Syrup'))
  or (r.name = 'Gin Fizz' and i.name in ('Gin', 'Lime Juice', 'Soda Water'));
