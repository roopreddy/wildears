/**
 * Species Database — Info cards for common Sacramento-area birds.
 * Photos use Wikimedia Commons URLs (free, no API key needed).
 * Data sourced from eBird, Audubon, and local birding guides.
 */
const SpeciesDB = (() => {

  // Sacramento-area species info keyed by common name (lowercase)
  const database = {
    "american robin": {
      commonName: "American Robin",
      scientificName: "Turdus migratorius",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Turdus-migratorius-002.jpg/640px-Turdus-migratorius-002.jpg",
      description: "A familiar songbird with a warm orange breast and cheerful song. Often seen hopping on lawns, pulling up earthworms. One of the first birds to sing at dawn.",
      habitat: "Lawns, parks, gardens, woodlands, forests",
      status: "common",
      funFact: "A robin can eat up to 14 feet of earthworms in a single day!"
    },
    "northern mockingbird": {
      commonName: "Northern Mockingbird",
      scientificName: "Mimus polyglottos",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Mimus_polyglottos1.jpg/640px-Mimus_polyglottos1.jpg",
      description: "A master mimic that can learn over 200 different songs. Gray with white wing patches that flash during flight. Sings day and night, especially during breeding season.",
      habitat: "Suburban areas, parks, hedgerows, open ground with shrubs",
      status: "common",
      funFact: "Males that sing more songs tend to attract mates faster!"
    },
    "house finch": {
      commonName: "House Finch",
      scientificName: "Haemorhous mexicanus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/House_Finch_%28male%29.jpg/640px-House_Finch_%28male%29.jpg",
      description: "A small, cheerful bird. Males have a rosy red head and breast, while females are brown-streaked. Originally a western bird, now found across the US.",
      habitat: "Cities, suburbs, farms, open woods",
      status: "common",
      funFact: "The red color comes from pigments in the food they eat — the more colorful the male, the better fed he is!"
    },
    "california scrub-jay": {
      commonName: "California Scrub-Jay",
      scientificName: "Aphelocoma californica",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/Aphelocoma_californica_Morro_Bay_2.jpg/640px-Aphelocoma_californica_Morro_Bay_2.jpg",
      description: "A bold, bright blue and gray jay without a crest. Intelligent and curious, often seen hopping on the ground or visiting feeders. Known for caching food.",
      habitat: "Oak woodlands, scrub, suburbs, parks",
      status: "common",
      funFact: "They hide thousands of acorns each fall and can remember where most of them are months later!"
    },
    "anna's hummingbird": {
      commonName: "Anna's Hummingbird",
      scientificName: "Calypte anna",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Calypte_anna_-San_Luis_Obispo%2C_California%2C_USA_-flying-8.jpg/640px-Calypte_anna_-San_Luis_Obispo%2C_California%2C_USA_-flying-8.jpg",
      description: "A tiny jewel-like bird with an iridescent rose-pink throat (males). The most common hummingbird in California. Hovers at flowers and feeders, beating wings 40-50 times per second.",
      habitat: "Gardens, parks, chaparral, open woodlands",
      status: "common",
      funFact: "During courtship, males dive from 130 feet high, reaching speeds of 60 mph!"
    },
    "red-tailed hawk": {
      commonName: "Red-tailed Hawk",
      scientificName: "Buteo jamaicensis",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Red-tailed_Hawk_Buteo_jamaicensis_Full_Body_1461px.jpg/640px-Red-tailed_Hawk_Buteo_jamaicensis_Full_Body_1461px.jpg",
      description: "A large, broad-winged hawk with a distinctive rusty-red tail. Often seen soaring in wide circles or perched on telephone poles. Has a raspy, screaming call.",
      habitat: "Open fields, woodlands, roadsides, parks",
      status: "common",
      funFact: "Its screaming cry is the sound effect Hollywood uses for almost every eagle and hawk in movies!"
    },
    "mourning dove": {
      commonName: "Mourning Dove",
      scientificName: "Zenaida macroura",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Mourning_Dove_2006.jpg/640px-Mourning_Dove_2006.jpg",
      description: "A graceful, slender dove with a soft, mournful cooing song. Light brown with black spots on the wings. One of the most common birds in North America.",
      habitat: "Open areas, fields, suburbs, woodland edges",
      status: "common",
      funFact: "Their wings make a distinctive whistling sound when they take off!"
    },
    "european starling": {
      commonName: "European Starling",
      scientificName: "Sturnus vulgaris",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4a/Sturnus_vulgaris_-Queenstown%2C_New_Zealand-8.jpg/640px-Sturnus_vulgaris_-Queenstown%2C_New_Zealand-8.jpg",
      description: "A stocky, dark bird with iridescent purple-green plumage and yellow bill in summer. Introduced from Europe in 1890. Amazing mimics that form spectacular murmurations.",
      habitat: "Cities, farms, parks — almost everywhere",
      status: "invasive",
      funFact: "All 200+ million starlings in North America descended from 100 birds released in New York's Central Park in 1890-91!"
    },
    "great blue heron": {
      commonName: "Great Blue Heron",
      scientificName: "Ardea herodias",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Ardea_herodias_-Morro_Bay_Heron_Rookery_-8.jpg/640px-Ardea_herodias_-Morro_Bay_Heron_Rookery_-8.jpg",
      description: "A tall, majestic wading bird standing up to 4.5 feet. Blue-gray with a black stripe above the eye. Patient hunters that stand motionless in water waiting for fish.",
      habitat: "Rivers, lakes, marshes, shores — including the American River Parkway",
      status: "common",
      funFact: "Despite their large size, they only weigh about 5-6 pounds thanks to hollow bones!"
    },
    "acorn woodpecker": {
      commonName: "Acorn Woodpecker",
      scientificName: "Melanerpes formicivorus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Acorn_Woodpecker.jpg/640px-Acorn_Woodpecker.jpg",
      description: "A clown-faced woodpecker with a red cap, white eyes, and bold black-and-white pattern. Lives in groups and drills thousands of holes in trees to store acorns.",
      habitat: "Oak woodlands, including Effie Yeaw Nature Center area",
      status: "common",
      funFact: "A single granary tree can have up to 50,000 holes, each stuffed with an acorn!"
    },
    "california quail": {
      commonName: "California Quail",
      scientificName: "Callipepla californica",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Callipepla_californica_-California%2C_USA_-pair-8.jpg/640px-Callipepla_californica_-California%2C_USA_-pair-8.jpg",
      description: "California's state bird! A plump, ground-dwelling bird with a forward-curving head plume. Travels in coveys of 10-200 birds, making a distinctive 'chi-CA-go' call.",
      habitat: "Chaparral, oak woodlands, suburbs, parks",
      status: "common",
      funFact: "Baby quail can run around and feed themselves within hours of hatching!"
    },
    "red-winged blackbird": {
      commonName: "Red-winged Blackbird",
      scientificName: "Agelaius phoeniceus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Red-winged_Blackbird_-_Agelaius_phoeniceus%2C_Occoquan_Bay_NWR%2C_Woodbridge%2C_Virginia.jpg/640px-Red-winged_Blackbird_-_Agelaius_phoeniceus%2C_Occoquan_Bay_NWR%2C_Woodbridge%2C_Virginia.jpg",
      description: "Males are jet black with brilliant red and yellow shoulder patches. Females are streaky brown. Among the most abundant birds in North America.",
      habitat: "Marshes, wetlands, fields, roadside ditches",
      status: "common",
      funFact: "Males fiercely defend their territory, even chasing away animals much larger than themselves!"
    },
    "wild turkey": {
      commonName: "Wild Turkey",
      scientificName: "Meleagris gallopavo",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Gall-dansen.jpg/640px-Gall-dansen.jpg",
      description: "A large, ground-dwelling bird with iridescent bronze plumage. Males fan their tails and strut during courtship. Surprisingly good fliers for short distances.",
      habitat: "Oak woodlands, forest edges, suburban areas near the American River",
      status: "common",
      funFact: "Wild turkeys can run up to 25 mph and fly at 55 mph in short bursts!"
    },
    "white-crowned sparrow": {
      commonName: "White-crowned Sparrow",
      scientificName: "Zonotrichia leucophrys",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6e/White-crowned_Sparrow_%28Zonotrichia_leucophrys%29.jpg/640px-White-crowned_Sparrow_%28Zonotrichia_leucophrys%29.jpg",
      description: "A handsome sparrow with bold black-and-white head stripes. A common winter visitor to Sacramento. Has a sweet, whistled song that varies by region.",
      habitat: "Brushy areas, gardens, parks, woodland edges",
      status: "common",
      funFact: "Different populations have their own song 'dialects' — you can tell where a bird is from by its song!"
    },
    "cooper's hawk": {
      commonName: "Cooper's Hawk",
      scientificName: "Accipiter cooperii",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Accipiter_cooperii_DK1.jpg/640px-Accipiter_cooperii_DK1.jpg",
      description: "A medium-sized hawk built for speed and agility. Blue-gray above with rusty bars below. Expert at catching birds in flight, often hunting at backyard feeders.",
      habitat: "Woodlands, suburbs, parks with trees",
      status: "common",
      funFact: "They're so agile they can fly through dense forest at high speed, weaving between trees!"
    },
    "great horned owl": {
      commonName: "Great Horned Owl",
      scientificName: "Bubo virginianus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Bubo_virginianus_06.jpg/640px-Bubo_virginianus_06.jpg",
      description: "A powerful, large owl with prominent ear tufts and intense yellow eyes. The 'hoot owl' whose deep hooting is an iconic nighttime sound. Top predator of the night sky.",
      habitat: "Forests, deserts, suburbs, parks — almost any habitat",
      status: "common",
      funFact: "They have a grip strength of about 300 PSI — that's stronger than a human hand!"
    },
    "barn owl": {
      commonName: "Barn Owl",
      scientificName: "Tyto alba",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Barn_Owl_-_Tyto_alba.jpg/640px-Barn_Owl_-_Tyto_alba.jpg",
      description: "A ghostly pale owl with a distinctive heart-shaped face. Hunts almost entirely by sound, flying silently over fields at night. Makes eerie screeching calls rather than hoots.",
      habitat: "Open farmland, grasslands, marshes, barns",
      status: "uncommon",
      funFact: "A family of barn owls can eat over 3,000 rodents during a nesting season, making them amazing pest controllers!"
    },
    "yellow-billed magpie": {
      commonName: "Yellow-billed Magpie",
      scientificName: "Pica nuttalli",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Pica_nuttalli_1.jpg/640px-Pica_nuttalli_1.jpg",
      description: "Found ONLY in California! A striking black-and-white bird with a long tail and bright yellow bill. Related to crows and jays, extremely intelligent.",
      habitat: "Oak savanna, farms, parks in California's Central Valley",
      status: "uncommon",
      funFact: "This bird exists nowhere else on Earth — it's endemic to California's Central Valley and coast ranges!"
    },
    "american crow": {
      commonName: "American Crow",
      scientificName: "Corvus brachyrhynchos",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Corvus_brachyrhynchos_30196.jpg/640px-Corvus_brachyrhynchos_30196.jpg",
      description: "An all-black, highly intelligent bird known for problem-solving and tool use. Lives in family groups and holds 'funerals' when a crow dies.",
      habitat: "Almost everywhere — cities, farms, forests, parks",
      status: "common",
      funFact: "Crows can recognize human faces and will remember people who have threatened them — for years!"
    },
    "red-shouldered hawk": {
      commonName: "Red-shouldered Hawk",
      scientificName: "Buteo lineatus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Red-shouldered_Hawk.jpg/640px-Red-shouldered_Hawk.jpg",
      description: "A colorful hawk with reddish-brown shoulders, barred chest, and banded tail. Common in riparian woodlands along the American River. Has a loud 'kee-aah' call.",
      habitat: "Riparian woodlands, suburban areas with tall trees",
      status: "common",
      funFact: "Blue jays often mimic red-shouldered hawk calls to scare other birds away from feeders!"
    },
    "oak titmouse": {
      commonName: "Oak Titmouse",
      scientificName: "Baeolophus inornatus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/Baeolophus_inornatus_-_Oak_Titmouse%2C_Sunol_Regional_Wilderness%2C_Alameda_County%2C_California.jpg/640px-Baeolophus_inornatus_-_Oak_Titmouse%2C_Sunol_Regional_Wilderness%2C_Alameda_County%2C_California.jpg",
      description: "A small, plain gray-brown bird with a tiny crest. What it lacks in color it makes up for in personality — active, vocal, and bold. A California specialty.",
      habitat: "Oak woodlands, especially at Effie Yeaw Nature Center",
      status: "common",
      funFact: "Pairs stay together for life and defend the same territory year after year!"
    },
    "nuttall's woodpecker": {
      commonName: "Nuttall's Woodpecker",
      scientificName: "Dryobates nuttallii",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Nuttall%E2%80%99s_Woodpecker_%28Dryobates_nuttallii%29.jpg/640px-Nuttall%E2%80%99s_Woodpecker_%28Dryobates_nuttallii%29.jpg",
      description: "A small black-and-white woodpecker found almost exclusively in California. Males have a red patch on the back of the head. Common in oak woodlands.",
      habitat: "Oak woodlands, riparian areas, orchards",
      status: "common",
      funFact: "Nearly the entire world population lives in California — another California specialty!"
    },
    "black phoebe": {
      commonName: "Black Phoebe",
      scientificName: "Sayornis nigricans",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Black_Phoebe_%28Sayornis_nigricans%29_-_02.jpg/640px-Black_Phoebe_%28Sayornis_nigricans%29_-_02.jpg",
      description: "A neat, sharply dressed flycatcher — all black above with a crisp white belly. Sits on low perches and sallies out to catch flying insects, wagging its tail constantly.",
      habitat: "Near water — streams, ponds, lakes, fountains",
      status: "common",
      funFact: "They build mud nests, sometimes reusing the same nest site for over 10 years!"
    },
    "canada goose": {
      commonName: "Canada Goose",
      scientificName: "Branta canadensis",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Canada_goose_on_Seedskadee_NWR_%2827826185489%29.jpg/640px-Canada_goose_on_Seedskadee_NWR_%2827826185489%29.jpg",
      description: "A large, well-known goose with a black head and neck, white chin strap, and brown body. Flies in V-formation. Extremely common in parks and golf courses.",
      habitat: "Lakes, rivers, parks, golf courses, farm fields",
      status: "common",
      funFact: "They fly in V-formation because each bird creates uplift for the one behind it, saving 70% energy!"
    },
    "bushtit": {
      commonName: "Bushtit",
      scientificName: "Psaltriparus minimus",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Psaltriparus_minimus_-Corvallis%2C_Oregon%2C_USA-8_%283%29.jpg/640px-Psaltriparus_minimus_-Corvallis%2C_Oregon%2C_USA-8_%283%29.jpg",
      description: "One of the smallest birds in North America — tiny, plain gray-brown, with a long tail. Travels in chattering flocks of 10-40, constantly moving through bushes and trees.",
      habitat: "Oak woodlands, scrub, parks, suburbs",
      status: "common",
      funFact: "They build amazing hanging sock-like nests up to a foot long, woven from spider silk and plant fibers!"
    },
    "song sparrow": {
      commonName: "Song Sparrow",
      scientificName: "Melospiza melodia",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Song_Sparrow-27527-2.jpg/640px-Song_Sparrow-27527-2.jpg",
      description: "A streaky brown sparrow with a central breast spot. One of the most widespread songbirds in North America. Males sing a distinctive, musical song from exposed perches.",
      habitat: "Thickets, marshes, gardens, stream edges",
      status: "common",
      funFact: "Each male has a repertoire of about 10 unique songs and can sing over 1,000 songs per day!"
    },
    "western bluebird": {
      commonName: "Western Bluebird",
      scientificName: "Sialia mexicana",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/Sialia_mexicana_male_4.jpg/640px-Sialia_mexicana_male_4.jpg",
      description: "A stunning small thrush — males are deep blue above with a rusty-orange breast. Females are grayer. Cavity nesters that benefit from nest boxes.",
      habitat: "Open woodlands, orchards, forest edges, parks",
      status: "uncommon",
      funFact: "They sometimes form winter flocks of hundreds, roosting together in tree cavities to stay warm!"
    },
    "white-breasted nuthatch": {
      commonName: "White-breasted Nuthatch",
      scientificName: "Sitta carolinensis",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/White-breasted_Nuthatch_%2848687028568%29.jpg/640px-White-breasted_Nuthatch_%2848687028568%29.jpg",
      description: "A compact bird that creeps headfirst down tree trunks — the only bird that regularly does this! Blue-gray above, white below, with a black cap.",
      habitat: "Oak woodlands, deciduous forests, suburbs with large trees",
      status: "common",
      funFact: "The name 'nuthatch' comes from 'nut-hack' — they wedge nuts into bark and hack them open!"
    },
    "lesser goldfinch": {
      commonName: "Lesser Goldfinch",
      scientificName: "Spinus psaltria",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Spinus_psaltria_-Arapaho_National_Wildlife_Refuge%2C_Colorado%2C_USA_-male-8.jpg/640px-Spinus_psaltria_-Arapaho_National_Wildlife_Refuge%2C_Colorado%2C_USA_-male-8.jpg",
      description: "A tiny, bright yellow-and-black finch (males). Common at feeders and in weedy areas. Has a sweet, tinkling song and bouncy flight.",
      habitat: "Weedy fields, gardens, oak woodlands, suburbs",
      status: "common",
      funFact: "They're excellent mimics and often incorporate bits of other birds' songs into their own!"
    },
    "great egret": {
      commonName: "Great Egret",
      scientificName: "Ardea alba",
      photo: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Ardea_alba_-_02.jpg/640px-Ardea_alba_-_02.jpg",
      description: "A tall, elegant all-white heron with a long yellow bill. Stands motionless in shallow water, then strikes lightning-fast to catch fish. A symbol of conservation.",
      habitat: "Wetlands, rivers, lakes, marshes — along the American River",
      status: "common",
      funFact: "The Great Egret is the symbol of the National Audubon Society — it was nearly hunted to extinction for its plumes!"
    }
  };

  function getInfo(commonName) {
    if (!commonName) return null;
    const key = commonName.toLowerCase().trim();
    return database[key] || null;
  }

  function search(query) {
    if (!query) return [];
    const q = query.toLowerCase().trim();
    return Object.values(database).filter(sp =>
      sp.commonName.toLowerCase().includes(q) ||
      sp.scientificName.toLowerCase().includes(q)
    );
  }

  function getAllSpecies() {
    return Object.values(database);
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'common': return { text: 'Common', class: 'status-common' };
      case 'uncommon': return { text: 'Uncommon', class: 'status-uncommon' };
      case 'rare': return { text: 'Rare', class: 'status-rare' };
      case 'invasive': return { text: 'Invasive', class: 'status-invasive' };
      default: return { text: status || 'Unknown', class: 'status-unknown' };
    }
  }

  return { getInfo, search, getAllSpecies, getStatusLabel };
})();
