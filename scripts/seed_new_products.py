"""One-off seed script: inserts the 4 new example products (Podcats, Nosy
Neighbor, Kahraba, Botox/Detox) built from the attached back-design photos.
Run once against local dev DB: python3 scripts/seed_new_products.py
"""
import json
import subprocess

PRODUCTS = [
    dict(
        nameEn="Podcats Tee",
        nameAr="بودكاتس",
        phraseEn="Podcats",
        phraseAr="بودكاتس",
        payoffEn="Doesn't leave voice notes. Drops episodes.",
        descriptionEn="Oversized, 100% cotton, w 3ala dahrak 2otta labsa headphones w 3am tsawwer podcast. Mesh 3am tehke, bas 3am tsajjel kel shi.",
        descriptionAr="قطعة أوفرسايز، قطن 100%، وعلى الظهر قطة واضعة سماعات وعم تسجل بودكاست. مش عم تحكي، بس عم تسجل كل شي.",
        collectionName="Kharbesh Quotes",
        productType="tee",
        garmentStyle="Oversized Tee",
        approvedColors=["Black", "Charcoal Blue", "White", "Grey"],
        sizes=["S", "M", "L", "XL", "XXL"],
        priceCents=3500,
        images=["/assets/brand/standard-front-black.jpg", "/assets/products/podcats-back.jpg"],
        status="active",
    ),
    dict(
        nameEn="Shu 3am Ye3mal 3andi Tee",
        nameAr="شو عم يعمل عندي",
        phraseEn="What's Going On At My Place?",
        phraseAr="إيه وشو عم يعمل عندي؟",
        payoffEn="Every neighbor's real hobby: minding yours.",
        descriptionEn="Cream cotton, oversized fit. L jar el fadoli 3am byefta7 l bab la yes2al 3an kel shi 3andak, bas heyye 3andou so2al akbar: shu fi 3andou.",
        descriptionAr="قطعة قطن كريمي، أوفرسايز. الجار الفضولي عم يفتح الباب لسائلك عن كل شي عندك، بس هو عندو سؤال أكبر: شو في عندو.",
        collectionName="Kharbesh Quotes",
        productType="tee",
        garmentStyle="Oversized Tee",
        approvedColors=["Black", "Charcoal Blue", "White", "Grey"],
        sizes=["S", "M", "L", "XL", "XXL"],
        priceCents=3500,
        images=["/assets/brand/standard-front-white.jpg", "/assets/products/nosy-neighbor-back.jpg"],
        status="active",
    ),
    dict(
        nameEn="Kahraba Rej3et Tee",
        nameAr="الكهربا راجعة من زمان",
        phraseEn="Power's Been Back For a While",
        phraseAr="الكهربا راجعة من زمان",
        payoffEn="Old news that still feels like breaking news.",
        descriptionEn="White cotton, oversized. El kahraba rej3et men zaman, bas mesh kel wa7ad se2el l akhbar. Chest logo standard, back print bel design.",
        descriptionAr="قطعة قطن بيضا، أوفرسايز. الكهربا راجعة من زمان، بس مش كل واحد سائل الأخبار. لوغو قدام ستاندرد، والطبعة بالظهر.",
        collectionName="Kharbesh Quotes",
        productType="tee",
        garmentStyle="Oversized Tee",
        approvedColors=["Black", "Charcoal Blue", "White", "Grey"],
        sizes=["S", "M", "L", "XL", "XXL"],
        priceCents=3500,
        images=["/assets/brand/standard-front-white.jpg", "/assets/products/kahraba-back.jpg"],
        status="active",
    ),
    dict(
        nameEn="Botox Detox Tee",
        nameAr="بالصيفية بوتوكس وبالشتوية ديتوكس",
        phraseEn="Summer Botox, Winter Detox",
        phraseAr="بالصيفية BOTOX و بالشتوية DETOX",
        payoffEn="The only seasonal routine Lebanon actually commits to.",
        descriptionEn="Black cotton, oversized. Kel season 3andou barnamajou: sayf botox, sheta detox, w inta bel nos 3am tfakker shu el ba3ad.",
        descriptionAr="قطعة قطن سودا، أوفرسايز. كل موسم عندو برنامجو: صيف بوتوكس، شتا ديتوكس، وانت بالنص عم تفكر شو البعد.",
        collectionName="Kharbesh Quotes",
        productType="tee",
        garmentStyle="Oversized Tee",
        approvedColors=["Black", "Charcoal Blue", "White", "Grey"],
        sizes=["S", "M", "L", "XL", "XXL"],
        priceCents=3500,
        images=["/assets/brand/standard-front-black.jpg", "/assets/products/botox-detox-back.jpg"],
        status="active",
    ),
]


def esc(v):
    if v is None:
        return "NULL"
    if isinstance(v, (list, dict)):
        v = json.dumps(v, ensure_ascii=False)
    v = str(v).replace("\\", "\\\\").replace("'", "\\'")
    return f"'{v}'"


def main():
    for p in PRODUCTS:
        cols = list(p.keys())
        vals = [esc(p[c]) for c in cols]
        sql = f"INSERT INTO products ({', '.join(cols)}) VALUES ({', '.join(vals)});"
        subprocess.run(
            ["mysql", "-u", "kharbesh", "-pkharbesh_dev_pw", "kharbesh", "--default-character-set=utf8mb4", "-e", sql],
            check=True,
        )
        print("inserted:", p["nameEn"])


if __name__ == "__main__":
    main()
