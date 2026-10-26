import json, urllib.request, urllib.parse, time
EP = "https://overpass-api.de/api/interpreter"
B = "47.775,18.94,47.825,19.02"
Q = {
 "pois": f'''[out:json][timeout:90];
(
 nwr["name"~"Fellegvár|Királyi [Pp]alota|Salamon|Kálvária|Silvanus|Mátyás|Herkules|Rév|rév|komp|Komp"]({B});
 nwr["amenity"="ferry_terminal"]({B});
 nwr["railway"~"station|halt"]({B});
 nwr["historic"]({B});
 nwr["tourism"~"viewpoint|museum|attraction"]({B});
 nwr["building"="chapel"]({B});
 nwr["amenity"="place_of_worship"]({B});
);
out center tags;''',
 "routes": f'''[out:json][timeout:90];
(
 rel["route"="hiking"](47.785,18.965,47.800,18.99);
 way["route"="ferry"]({B});
);
out geom;''',
}
for k, q in Q.items():
    for attempt in range(3):
        try:
            data = urllib.parse.urlencode({"data": q}).encode()
            req = urllib.request.Request(EP, data=data, headers={"User-Agent": "bp-guide-test/1.0"})
            r = urllib.request.urlopen(req, timeout=120).read()
            open(f"osm/{k}.json", "wb").write(r); print(k, len(r)); break
        except Exception as e:
            print(k, "retry", e); time.sleep(10)
