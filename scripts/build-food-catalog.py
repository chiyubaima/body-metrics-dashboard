"""Rebuild the compact public USDA catalog. Raw archives live only in work/."""
import json, urllib.request, zipfile, pathlib
base=pathlib.Path(__file__).resolve().parents[1]
rows=[]
for filename,key,version in [('FoodData_Central_sr_legacy_food_json_2018-04.zip','SRLegacyFoods','SR Legacy · 2018-04'),('FoodData_Central_survey_food_json_2024-10-31.zip','SurveyFoods','FNDDS · 2021–2023')]:
 path=base/'work'/filename
 if not path.exists():
  urllib.request.urlretrieve('https://fdc.nal.usda.gov/fdc-datasets/'+filename,path)
 with zipfile.ZipFile(path) as z:
  payload=json.loads(z.read(next(n for n in z.namelist() if n.endswith('.json'))))
 foods=payload.get(key)
 if foods is None: raise RuntimeError('Unexpected USDA format: '+str(payload.keys()))
 for food in foods:
  nutrients={n['nutrient']['id']:n.get('amount',n.get('value')) for n in food['foodNutrients']}
  energy=nutrients.get(1008,nutrients.get(2048,nutrients.get(2047)))
  rows.append([food['fdcId'],food['description'],version,energy,nutrients.get(1003),nutrients.get(1005),nutrients.get(1004)])
 print(version,len(foods),flush=True)
rows.sort(key=lambda r:r[0])
assert len({r[0] for r in rows})==len(rows)
(base/'data'/'foods.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':'))+'\n')
print('Wrote',len(rows),'foods',flush=True)
